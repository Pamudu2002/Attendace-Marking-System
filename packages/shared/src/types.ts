/** Response shapes of the REST API (docs/API.md). Dates are ISO strings. */

export type Role = "teacher" | "student_device";

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TeacherDto {
  id: string;
  email: string;
  fullName: string;
}

export interface ClassDto {
  id: string;
  name: string;
  code: string | null;
  thresholdPct: number;
  lateAfterMin: number;
  checkInOpensBeforeMin: number;
  archivedAt: string | null;
  createdAt: string;
  studentCount: number;
  sessionCount: number;
  nextSession: SessionDto | null;
}

export interface SessionDto {
  id: string;
  classId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  cancelledAt: string | null;
  presentCount?: number;
  enrolledCount?: number;
  className?: string;
}

export interface RosterStudentDto {
  studentId: string;
  indexNumber: string;
  fullName: string;
  enrolledAt: string;
  device: { id: string; model: string | null; status: "ACTIVE" | "REVOKED" } | null;
  attendancePct: number | null;
}

export interface RosterKeyDto {
  studentId: string;
  indexNumber: string;
  fullName: string;
  deviceId: string;
  /** SPKI DER, base64url */
  publicKey: string;
}

export interface EnrollResultDto {
  student: { id: string; indexNumber: string; fullName: string };
  enrollment: { enrolledAt: string };
  warnings: string[];
}

export type AttendanceRowStatus = "PRESENT" | "LATE" | "EXCUSED" | "ABSENT";

export interface SessionAttendanceDto {
  session: SessionDto;
  items: {
    studentId: string;
    indexNumber: string;
    fullName: string;
    status: AttendanceRowStatus;
    tappedAt: string | null;
    source: "NFC" | "MANUAL" | null;
  }[];
}

export interface BatchResultDto {
  results: { clientRecordId: string; result: "accepted" | "duplicate" | "rejected"; reason?: string }[];
}

export interface AnalyticsSummaryDto {
  thresholdPct: number;
  enrolledCount: number;
  sessionsHeld: number;
  sessionsRemaining: number;
  classAvgPct: number | null;
  onTimePct: number | null;
  belowThresholdCount: number;
  statusSplit: { present: number; late: number; excused: number; absent: number };
}

export interface StudentAnalyticsRowDto {
  studentId: string;
  indexNumber: string;
  fullName: string;
  counted: number;
  attended: number;
  late: number;
  pct: number | null;
  belowThreshold: boolean;
  maxAchievablePct: number | null;
  sessionsNeeded: number | null;
}

export interface StudentDetailDto {
  student: { id: string; indexNumber: string; fullName: string };
  pct: number | null;
  maxAchievablePct: number | null;
  sessionsNeeded: number | null;
  timeline: { sessionId: string; name: string; startsAt: string; status: AttendanceRowStatus; minutesFromStart: number | null }[];
  longestStreak: number;
  currentStreak: number;
}

export interface SessionTrendDto {
  items: { sessionId: string; name: string; startsAt: string; presentPct: number | null; latePct: number | null; count: number }[];
}

export interface MatrixDto {
  students: { id: string; indexNumber: string; fullName: string }[];
  sessions: { id: string; name: string; startsAt: string }[];
  /** cells[studentIdx][sessionIdx] */
  cells: (AttendanceRowStatus | null)[][];
}

export interface ArrivalsDto {
  bins: { minuteFrom: number; minuteTo: number; count: number }[];
}

export interface PatternsDto {
  byWeekday: { weekday: number; label: string; pct: number | null; sessions: number }[];
  byStartHour: { hour: number; pct: number | null; sessions: number }[];
}

export interface StudentMeDto {
  deviceId: string;
  bound: boolean;
  student: { id: string; indexNumber: string; fullName: string } | null;
}

export interface StudentClassDto {
  classId: string;
  name: string;
  code: string | null;
  teacherName: string;
  thresholdPct: number;
  attendancePct: number | null;
  nextSession: SessionDto | null;
}

export interface StudentClassDetailDto {
  class: { id: string; name: string; code: string | null; teacherName: string; thresholdPct: number };
  attendancePct: number | null;
  maxAchievablePct: number | null;
  sessionsNeeded: number | null;
  history: { sessionId: string; name: string; startsAt: string; endsAt: string; status: AttendanceRowStatus | "UPCOMING" | "CANCELLED" }[];
}

/** FCM data payload types sent by the backend. */
export type PushType = "SESSION_REMINDER" | "SESSION_CHANGED" | "SESSION_CANCELLED" | "ENROLLED" | "DEVICE_REVOKED";
