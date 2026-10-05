import {
  attendancePct,
  maxAchievablePct,
  sessionsNeeded,
  type AnalyticsSummaryDto,
  type ArrivalsDto,
  type AttendanceRowStatus,
  type MatrixDto,
  type PatternsDto,
  type SessionTrendDto,
  type StudentAnalyticsRowDto,
  type StudentDetailDto,
} from "@attendance/shared";
import { prisma } from "./db";

/**
 * Attendance analytics (docs/PLAN.md §7).
 * A session is "held" when it has ended and was not cancelled. It counts for a student
 * if it started on/after the day they enrolled. ABSENT is derived, never stored.
 */

interface ClassLike {
  id: string;
  thresholdPct: number;
}

interface StatsRow {
  student_id: string;
  index_number: string;
  full_name: string;
  enrolled_at: Date;
  counted: bigint;
  attended: bigint;
  present: bigint;
  late: bigint;
  excused: bigint;
}

async function remainingSessions(classId: string): Promise<number> {
  return prisma.classSession.count({ where: { classId, cancelledAt: null, endsAt: { gte: new Date() } } });
}

async function statsRows(classId: string, studentId: string | null): Promise<StatsRow[]> {
  return prisma.$queryRaw<StatsRow[]>`
    WITH held AS (
      SELECT id, starts_at FROM class_session
      WHERE class_id = ${classId}::uuid AND cancelled_at IS NULL AND ends_at < now()
    ), roster AS (
      SELECT student_id, enrolled_at FROM enrollment
      WHERE class_id = ${classId}::uuid AND removed_at IS NULL
        AND (${studentId}::uuid IS NULL OR student_id = ${studentId}::uuid)
    )
    SELECT s.id AS student_id, s.index_number, s.full_name, r.enrolled_at,
           COUNT(h.id)                                     AS counted,
           COUNT(a.id)                                     AS attended,
           COUNT(a.id) FILTER (WHERE a.status = 'PRESENT') AS present,
           COUNT(a.id) FILTER (WHERE a.status = 'LATE')    AS late,
           COUNT(a.id) FILTER (WHERE a.status = 'EXCUSED') AS excused
    FROM roster r
    JOIN student s   ON s.id = r.student_id
    LEFT JOIN held h ON h.starts_at >= date_trunc('day', r.enrolled_at)
    LEFT JOIN attendance_record a ON a.session_id = h.id AND a.student_id = r.student_id
    GROUP BY s.id, r.enrolled_at
    ORDER BY s.index_number`;
}

function toRow(r: StatsRow, remaining: number, thresholdPct: number): StudentAnalyticsRowDto {
  const counted = Number(r.counted);
  const attended = Number(r.attended);
  const pct = attendancePct(attended, counted);
  return {
    studentId: r.student_id,
    indexNumber: r.index_number,
    fullName: r.full_name,
    counted,
    attended,
    late: Number(r.late),
    pct,
    belowThreshold: pct !== null && pct < thresholdPct,
    maxAchievablePct: maxAchievablePct(attended, counted, remaining),
    sessionsNeeded: sessionsNeeded(attended, counted, remaining, thresholdPct),
  };
}

export async function studentRows(cls: ClassLike, studentId: string | null = null): Promise<StudentAnalyticsRowDto[]> {
  const [rows, remaining] = await Promise.all([statsRows(cls.id, studentId), remainingSessions(cls.id)]);
  return rows
    .map((r) => toRow(r, remaining, cls.thresholdPct))
    .sort((a, b) => (a.pct ?? -1) - (b.pct ?? -1) || a.indexNumber.localeCompare(b.indexNumber));
}

export async function summary(cls: ClassLike): Promise<AnalyticsSummaryDto> {
  const now = new Date();
  const [rows, remaining, held] = await Promise.all([
    statsRows(cls.id, null),
    remainingSessions(cls.id),
    prisma.classSession.count({ where: { classId: cls.id, cancelledAt: null, endsAt: { lt: now } } }),
  ]);
  let counted = 0,
    present = 0,
    late = 0,
    excused = 0,
    below = 0;
  for (const r of rows) {
    counted += Number(r.counted);
    present += Number(r.present);
    late += Number(r.late);
    excused += Number(r.excused);
    const pct = attendancePct(Number(r.attended), Number(r.counted));
    if (pct !== null && pct < cls.thresholdPct) below++;
  }
  const attended = present + late + excused;
  return {
    thresholdPct: cls.thresholdPct,
    enrolledCount: rows.length,
    sessionsHeld: held,
    sessionsRemaining: remaining,
    classAvgPct: attendancePct(attended, counted),
    onTimePct: attendancePct(present, present + late),
    belowThresholdCount: below,
    statusSplit: { present, late, excused, absent: counted - attended },
  };
}

interface TrendRow {
  session_id: string;
  name: string;
  starts_at: Date;
  eligible: bigint;
  attended: bigint;
  late: bigint;
}

async function trendRows(classId: string): Promise<TrendRow[]> {
  return prisma.$queryRaw<TrendRow[]>`
    SELECT cs.id AS session_id, cs.name, cs.starts_at,
      (SELECT COUNT(*) FROM enrollment e
        WHERE e.class_id = cs.class_id AND e.removed_at IS NULL
          AND date_trunc('day', e.enrolled_at) <= cs.starts_at)            AS eligible,
      (SELECT COUNT(*) FROM attendance_record a WHERE a.session_id = cs.id) AS attended,
      (SELECT COUNT(*) FROM attendance_record a WHERE a.session_id = cs.id AND a.status = 'LATE') AS late
    FROM class_session cs
    WHERE cs.class_id = ${classId}::uuid AND cs.cancelled_at IS NULL AND cs.ends_at < now()
    ORDER BY cs.starts_at`;
}

export async function sessionTrend(classId: string): Promise<SessionTrendDto> {
  const rows = await trendRows(classId);
  return {
    items: rows.map((r) => ({
      sessionId: r.session_id,
      name: r.name,
      startsAt: r.starts_at.toISOString(),
      presentPct: attendancePct(Number(r.attended), Number(r.eligible)),
      latePct: attendancePct(Number(r.late), Number(r.eligible)),
      count: Number(r.attended),
    })),
  };
}

export async function matrix(classId: string): Promise<MatrixDto> {
  const now = new Date();
  const [enrollments, sessions] = await Promise.all([
    prisma.enrollment.findMany({
      where: { classId, removedAt: null },
      include: { student: true },
      orderBy: { student: { indexNumber: "asc" } },
    }),
    prisma.classSession.findMany({
      where: { classId, cancelledAt: null, endsAt: { lt: now } },
      orderBy: { startsAt: "asc" },
      include: { attendance: { select: { studentId: true, status: true } } },
    }),
  ]);
  return {
    students: enrollments.map((e) => ({ id: e.student.id, indexNumber: e.student.indexNumber, fullName: e.student.fullName })),
    sessions: sessions.map((s) => ({ id: s.id, name: s.name, startsAt: s.startsAt.toISOString() })),
    cells: enrollments.map((e) => {
      const enrolledDay = new Date(e.enrolledAt);
      enrolledDay.setUTCHours(0, 0, 0, 0);
      return sessions.map((s): AttendanceRowStatus | null => {
        if (s.startsAt < enrolledDay) return null;
        return s.attendance.find((a) => a.studentId === e.studentId)?.status ?? "ABSENT";
      });
    }),
  };
}

export async function arrivals(classId: string, binMinutes = 5): Promise<ArrivalsDto> {
  const rows = await prisma.$queryRaw<{ minutes: number }[]>`
    SELECT EXTRACT(EPOCH FROM (a.tapped_at - cs.starts_at)) / 60.0 AS minutes
    FROM attendance_record a JOIN class_session cs ON cs.id = a.session_id
    WHERE cs.class_id = ${classId}::uuid AND a.source = 'NFC'`;
  const from = -30,
    to = 90;
  const bins: ArrivalsDto["bins"] = [];
  for (let m = from; m < to; m += binMinutes) bins.push({ minuteFrom: m, minuteTo: m + binMinutes, count: 0 });
  for (const { minutes } of rows) {
    const m = Math.min(Math.max(Number(minutes), from), to - 0.001);
    const bin = bins[Math.floor((m - from) / binMinutes)];
    if (bin) bin.count++;
  }
  return { bins };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Attendance by weekday / start hour, computed in the viewer's time zone. */
export async function patterns(classId: string, timeZone: string): Promise<PatternsDto> {
  const rows = await trendRows(classId);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" });
  const byDay = new Map<number, { att: number; elig: number; n: number }>();
  const byHour = new Map<number, { att: number; elig: number; n: number }>();
  for (const r of rows) {
    const parts = fmt.formatToParts(r.starts_at);
    const day = WEEKDAYS.indexOf(parts.find((p) => p.type === "weekday")?.value ?? "");
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    for (const [map, key] of [
      [byDay, day],
      [byHour, hour],
    ] as const) {
      const acc = map.get(key) ?? { att: 0, elig: 0, n: 0 };
      acc.att += Number(r.attended);
      acc.elig += Number(r.eligible);
      acc.n++;
      map.set(key, acc);
    }
  }
  return {
    byWeekday: WEEKDAYS.map((label, weekday) => {
      const a = byDay.get(weekday);
      return { weekday, label, pct: a ? attendancePct(a.att, a.elig) : null, sessions: a?.n ?? 0 };
    }),
    byStartHour: [...byHour.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, a]) => ({ hour, pct: attendancePct(a.att, a.elig), sessions: a.n })),
  };
}

export async function studentDetail(cls: ClassLike, studentId: string): Promise<StudentDetailDto | null> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { classId_studentId: { classId: cls.id, studentId } },
    include: { student: true },
  });
  if (!enrollment) return null;
  const enrolledDay = new Date(enrollment.enrolledAt);
  enrolledDay.setUTCHours(0, 0, 0, 0);
  const [sessions, [row]] = await Promise.all([
    prisma.classSession.findMany({
      where: { classId: cls.id, cancelledAt: null, endsAt: { lt: new Date() }, startsAt: { gte: enrolledDay } },
      orderBy: { startsAt: "asc" },
      include: { attendance: { where: { studentId } } },
    }),
    studentRows(cls, studentId),
  ]);
  const timeline = sessions.map((s) => {
    const a = s.attendance[0];
    return {
      sessionId: s.id,
      name: s.name,
      startsAt: s.startsAt.toISOString(),
      status: (a?.status ?? "ABSENT") as AttendanceRowStatus,
      minutesFromStart: a ? Math.round((a.tappedAt.getTime() - s.startsAt.getTime()) / 6000) / 10 : null,
    };
  });
  let longest = 0,
    run = 0;
  for (const t of timeline) {
    run = t.status === "ABSENT" ? 0 : run + 1;
    longest = Math.max(longest, run);
  }
  return {
    student: { id: enrollment.student.id, indexNumber: enrollment.student.indexNumber, fullName: enrollment.student.fullName },
    pct: row?.pct ?? null,
    maxAchievablePct: row?.maxAchievablePct ?? null,
    sessionsNeeded: row?.sessionsNeeded ?? null,
    timeline,
    longestStreak: longest,
    currentStreak: run,
  };
}
