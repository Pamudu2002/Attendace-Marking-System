import { requireNativeModule } from "expo";

type EventSubscription = { remove(): void };

export interface HceStatus {
  nfcSupported: boolean;
  hceSupported: boolean;
  nfcEnabled: boolean;
  deviceId: string | null;
  hasKey: boolean;
}

export interface KeyDetails {
  /** SubjectPublicKeyInfo DER, base64url */
  publicKey: string;
  securityLevel: "STRONGBOX" | "TEE" | "SOFTWARE" | "UNKNOWN";
  hardwareBacked: boolean;
}

export interface TapEntry {
  at: number;
  purpose: "ENROLL" | "ATTEND";
  result: number;
  resultName?: string;
  message: string;
  /** Keystore signing time for this tap (experiment: TEE vs StrongBox). */
  signMs?: number | null;
}

interface AttendanceHceNative {
  getStatus(): HceStatus;
  ensureKeyAsync(): Promise<KeyDetails>;
  setDeviceId(deviceId: string): void;
  signLoginChallengeAsync(nonceB64url: string): Promise<string>;
  clearIdentityAsync(): Promise<void>;
  getRecentTaps(): TapEntry[];
  openNfcSettings(): void;
  addListener(event: "onTap", listener: (e: TapEntry) => void): EventSubscription;
}

let native: AttendanceHceNative | null = null;
function mod(): AttendanceHceNative {
  native ??= requireNativeModule<AttendanceHceNative>("AttendanceHce");
  return native;
}

export const Hce = {
  getStatus: () => mod().getStatus(),
  ensureKey: () => mod().ensureKeyAsync(),
  setDeviceId: (id: string) => mod().setDeviceId(id),
  signLoginChallenge: (nonce: string) => mod().signLoginChallengeAsync(nonce),
  clearIdentity: () => mod().clearIdentityAsync(),
  getRecentTaps: () => mod().getRecentTaps(),
  openNfcSettings: () => mod().openNfcSettings(),
  addTapListener: (fn: (e: TapEntry) => void) => mod().addListener("onTap", fn),
};

export const isPositiveResult = (result: number) => result <= 0x03;
