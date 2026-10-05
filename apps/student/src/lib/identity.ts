import * as Application from "expo-application";
import * as Device from "expo-device";
import { ApiError } from "@attendance/mobile-core";
import { Hce, type HceStatus } from "../../modules/attendance-hce";
import { api, loginWithDeviceKey, tokens } from "./api";

export interface IdentityState {
  status: HceStatus;
  deviceId: string;
  securityLevel: string;
}

/**
 * First launch: create the Keystore key, register the public key with the backend, store the deviceId,
 * then log in by signing a challenge. Later launches only refresh the session.
 */
export async function bootstrapIdentity(): Promise<IdentityState> {
  const key = await Hce.ensureKey();
  let status = Hce.getStatus();

  if (!status.deviceId) {
    const { deviceId } = await api.post<{ deviceId: string }>(
      "/auth/student/devices",
      {
        publicKey: key.publicKey,
        keyAlgorithm: "ES256",
        hardwareBacked: key.hardwareBacked,
        manufacturer: Device.manufacturer ?? undefined,
        model: Device.modelName ?? undefined,
        androidVersion: Device.osVersion ?? undefined,
        appVersion: Application.nativeApplicationVersion ?? undefined,
      },
      { auth: false },
    );
    Hce.setDeviceId(deviceId);
    await tokens.set(null);
    status = Hce.getStatus();
  }

  if (!(await tokens.get())) {
    try {
      const r = await loginWithDeviceKey();
      await tokens.set({ accessToken: r.accessToken, refreshToken: r.refreshToken });
    } catch (e) {
      // The server no longer knows this device (e.g. database reset): start over with a new key.
      if (e instanceof ApiError && e.code === "UNKNOWN_DEVICE") {
        await resetIdentity();
        return bootstrapIdentity();
      }
      throw e;
    }
  }
  return { status, deviceId: status.deviceId!, securityLevel: key.securityLevel };
}

/** Forget this phone's identity. The lecturer must enrol (tap) the phone again. */
export async function resetIdentity() {
  await Hce.clearIdentity();
  await tokens.set(null);
}
