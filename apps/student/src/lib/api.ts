import { createApiClient, secureTokenStore } from "@attendance/mobile-core";
import type { TokenPair } from "@attendance/shared";
import { Hce } from "../../modules/attendance-hce";
import { getApiUrl } from "./config";

export const tokens = secureTokenStore("student_tokens");

/** Challenge–response login with the Keystore key (docs/IDENTITY_AND_AUTH.md §4.3). No password. */
export async function loginWithDeviceKey(): Promise<TokenPair & { bound: boolean }> {
  const deviceId = Hce.getStatus().deviceId;
  if (!deviceId) throw new Error("Device is not registered");
  const challenge = await api.post<{ challengeId: string; nonce: string }>("/auth/student/challenge", { deviceId }, { auth: false });
  const signature = await Hce.signLoginChallenge(challenge.nonce);
  return api.post("/auth/student/verify", { challengeId: challenge.challengeId, signature }, { auth: false });
}

export const api = createApiClient({
  baseUrl: getApiUrl,
  tokens,
  // Students never type a password: an expired session is renewed silently by signing a new challenge.
  reauthenticate: async () => {
    const r = await loginWithDeviceKey();
    return { accessToken: r.accessToken, refreshToken: r.refreshToken };
  },
});
