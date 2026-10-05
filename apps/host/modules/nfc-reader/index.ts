import { requireNativeModule } from "expo";

type Subscription = { remove(): void };

export type TapOutcome =
  | "OK"
  | "DUPLICATE"
  | "NOT_ENROLLED"
  | "UNKNOWN_DEVICE"
  | "BAD_SIGNATURE"
  | "OUTSIDE_WINDOW"
  | "TAG_LOST"
  | "TIMEOUT"
  | "PROTOCOL_ERROR";

/** One tap as measured by the reader (times in ms from tag discovery, via elapsedRealtimeNanos). */
export interface TapEvent {
  tapId?: string;
  purpose: "ATTEND" | "ENROLL";
  contextId?: string;
  outcome: TapOutcome | "PENDING";
  discoveredAt: number;
  deviceId?: string;
  studentId?: string;
  fullName?: string;
  indexNumber?: string;
  status?: "PRESENT" | "LATE";
  resultCode?: number;
  nonce?: string;
  hostTime?: number;
  signature?: string;
  tSelectMs?: number;
  tAuthMs?: number;
  tVerifyMs?: number;
  tTotalMs?: number;
  tConfirmMs?: number;
  confirmed?: boolean;
  errorDetail?: string;
}

export interface RosterEntry {
  deviceId: string;
  studentId: string;
  fullName: string;
  indexNumber: string;
  publicKey: string;
}

export interface AttendanceConfig {
  sessionId: string;
  label: string;
  startsAt: number;
  endsAt: number;
  checkInOpensBeforeMin: number;
  lateAfterMin: number;
  roster: RosterEntry[];
  alreadyMarked: string[];
}

export const ConfirmResult = {
  PRESENT: 0x00,
  LATE: 0x01,
  ALREADY_MARKED: 0x02,
  ENROLLED: 0x03,
  NOT_ENROLLED: 0x10,
  OUTSIDE_WINDOW: 0x11,
  BAD_SIGNATURE: 0x12,
  UNKNOWN_DEVICE: 0x13,
} as const;

interface NfcReaderNative {
  getStatus(): { nfcSupported: boolean; nfcEnabled: boolean; readerActive: boolean };
  openNfcSettings(): void;
  startAttendance(config: AttendanceConfig): Promise<number>;
  startEnrollment(config: { classId: string; label: string; confirmTimeoutMs?: number }): Promise<void>;
  resolveEnrollment(tapId: string, result: number, message: string): void;
  setMarked(studentIds: string[]): void;
  stop(): Promise<void>;
  addListener(event: "onTap" | "onEnrollProof", fn: (e: TapEvent) => void): Subscription;
  addListener(event: "onReaderState", fn: (e: { active: boolean }) => void): Subscription;
}

let native: NfcReaderNative | null = null;
function mod(): NfcReaderNative {
  native ??= requireNativeModule<NfcReaderNative>("NfcReader");
  return native;
}

export const NfcReader = {
  getStatus: () => mod().getStatus(),
  openNfcSettings: () => mod().openNfcSettings(),
  /** Resolves with the number of usable roster keys. */
  startAttendance: (config: AttendanceConfig) => mod().startAttendance(config),
  startEnrollment: (classId: string, label: string, confirmTimeoutMs = 8000) =>
    mod().startEnrollment({ classId, label, confirmTimeoutMs }),
  resolveEnrollment: (tapId: string, result: number, message: string) => mod().resolveEnrollment(tapId, result, message),
  setMarked: (studentIds: string[]) => mod().setMarked(studentIds),
  stop: () => mod().stop(),
  onTap: (fn: (e: TapEvent) => void) => mod().addListener("onTap", fn),
  onEnrollProof: (fn: (e: TapEvent) => void) => mod().addListener("onEnrollProof", fn),
  onReaderState: (fn: (e: { active: boolean }) => void) => mod().addListener("onReaderState", fn),
};
