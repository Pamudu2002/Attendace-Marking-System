import { z } from "zod";

/** Request body schemas shared by the backend (validation) and the apps (typed clients). */

const b64url = z.base64url();
const isoDate = z.iso.datetime({ offset: true });
const indexNumber = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .transform((s) => s.toUpperCase());

// ---- Auth ------------------------------------------------------------------

export const TeacherRegisterBody = z.object({
  email: z.email().transform((s) => s.toLowerCase()),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(1).max(120),
});

export const TeacherLoginBody = z.object({
  email: z.email().transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(200),
});

export const TeacherUpdateBody = z
  .object({
    fullName: z.string().trim().min(1).max(120).optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8).max(200).optional(),
  })
  .refine((b) => !b.newPassword || b.currentPassword, {
    message: "currentPassword is required to set newPassword",
    path: ["currentPassword"],
  });

export const DeviceRegisterBody = z.object({
  /** SubjectPublicKeyInfo DER of an EC P-256 key, base64url. */
  publicKey: b64url,
  keyAlgorithm: z.literal("ES256").default("ES256"),
  hardwareBacked: z.boolean().default(false),
  manufacturer: z.string().max(80).optional(),
  model: z.string().max(80).optional(),
  androidVersion: z.string().max(20).optional(),
  appVersion: z.string().max(20).optional(),
});

export const ChallengeBody = z.object({ deviceId: z.uuid() });

export const VerifyBody = z.object({
  challengeId: z.uuid(),
  signature: b64url,
});

export const RefreshBody = z.object({ refreshToken: z.string().min(16).max(200) });

// ---- Classes ---------------------------------------------------------------

export const ClassCreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(30).optional(),
  thresholdPct: z.number().int().min(1).max(100).default(80),
  lateAfterMin: z.number().int().min(0).max(240).default(15),
  checkInOpensBeforeMin: z.number().int().min(0).max(240).default(15),
});

export const ClassUpdateBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().max(30).nullable().optional(),
  thresholdPct: z.number().int().min(1).max(100).optional(),
  lateAfterMin: z.number().int().min(0).max(240).optional(),
  checkInOpensBeforeMin: z.number().int().min(0).max(240).optional(),
  archived: z.boolean().optional(),
});

// ---- Enrolment -------------------------------------------------------------

export const NfcProof = z.object({
  deviceId: z.uuid(),
  nonce: b64url,
  hostTime: z.number().int().positive(),
  signature: b64url,
});

export const EnrollBody = z.object({
  fullName: z.string().trim().min(1).max(120),
  indexNumber,
  proof: NfcProof,
  replaceDevice: z.boolean().default(false),
});

// ---- Sessions --------------------------------------------------------------

export const SessionCreateBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    startsAt: isoDate,
    endsAt: isoDate,
  })
  .refine((s) => new Date(s.endsAt) > new Date(s.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export const SessionBulkBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    startsAt: isoDate,
    endsAt: isoDate,
    repeat: z.object({ weekly: z.literal(true), until: isoDate }),
  })
  .refine((s) => new Date(s.endsAt) > new Date(s.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export const SessionUpdateBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  startsAt: isoDate.optional(),
  endsAt: isoDate.optional(),
});

export const RangeQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

// ---- Attendance ------------------------------------------------------------

export const AttendanceStatus = z.enum(["PRESENT", "LATE", "EXCUSED"]);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

export const AttendanceBatchBody = z.object({
  records: z
    .array(
      z.object({
        clientRecordId: z.uuid(),
        deviceId: z.uuid(),
        status: z.enum(["PRESENT", "LATE"]),
        tappedAt: isoDate,
        proof: z.object({
          nonce: b64url,
          hostTime: z.number().int().positive(),
          signature: b64url,
        }),
      }),
    )
    .min(1)
    .max(500),
});

export const ManualAttendanceBody = z.object({
  status: AttendanceStatus,
  note: z.string().max(300).optional(),
});

// ---- Telemetry -------------------------------------------------------------

export const TapOutcome = z.enum([
  "OK",
  "DUPLICATE",
  "NOT_ENROLLED",
  "UNKNOWN_DEVICE",
  "BAD_SIGNATURE",
  "OUTSIDE_WINDOW",
  "TAG_LOST",
  "TIMEOUT",
  "PROTOCOL_ERROR",
]);
export type TapOutcome = z.infer<typeof TapOutcome>;

export const TapEventInput = z.object({
  clientEventId: z.uuid(),
  hostModel: z.string().max(120),
  purpose: z.enum(["ENROLL", "ATTEND"]),
  contextId: z.uuid().nullable().optional(),
  deviceIdHash: z.string().max(128).nullable().optional(),
  outcome: TapOutcome,
  discoveredAt: isoDate,
  tSelectMs: z.number().nonnegative().nullable().optional(),
  tAuthMs: z.number().nonnegative().nullable().optional(),
  tVerifyMs: z.number().nonnegative().nullable().optional(),
  tTotalMs: z.number().nonnegative().nullable().optional(),
  conditions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullable().optional(),
  errorDetail: z.string().max(500).nullable().optional(),
});
export type TapEventInput = z.infer<typeof TapEventInput>;

export const TapEventsBody = z.object({ events: z.array(TapEventInput).min(1).max(1000) });

// ---- Student app -----------------------------------------------------------

export const StudentDeviceUpdateBody = z.object({
  fcmToken: z.string().max(4096).nullable().optional(),
  appVersion: z.string().max(20).optional(),
  androidVersion: z.string().max(20).optional(),
});

export const NotificationAckBody = z.object({
  receivedAt: isoDate,
  openedAt: isoDate.optional(),
});
