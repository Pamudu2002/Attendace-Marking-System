import { beforeEach, describe, expect, it } from "vitest";
import * as teacherRegister from "@/app/api/v1/auth/teacher/register/route";
import * as teacherLogin from "@/app/api/v1/auth/teacher/login/route";
import * as teacherMe from "@/app/api/v1/auth/teacher/me/route";
import * as refresh from "@/app/api/v1/auth/refresh/route";
import * as devices from "@/app/api/v1/auth/student/devices/route";
import * as challenge from "@/app/api/v1/auth/student/challenge/route";
import * as verify from "@/app/api/v1/auth/student/verify/route";
import * as classes from "@/app/api/v1/classes/route";
import * as classOne from "@/app/api/v1/classes/[classId]/route";
import * as enrollments from "@/app/api/v1/classes/[classId]/enrollments/route";
import * as rosterKeys from "@/app/api/v1/classes/[classId]/roster-keys/route";
import * as roster from "@/app/api/v1/classes/[classId]/students/route";
import * as sessions from "@/app/api/v1/classes/[classId]/sessions/route";
import * as sessionsBulk from "@/app/api/v1/classes/[classId]/sessions/bulk/route";
import * as sessionOne from "@/app/api/v1/sessions/[sessionId]/route";
import * as sessionCancel from "@/app/api/v1/sessions/[sessionId]/cancel/route";
import * as attendance from "@/app/api/v1/sessions/[sessionId]/attendance/route";
import * as batch from "@/app/api/v1/sessions/[sessionId]/attendance/batch/route";
import * as manual from "@/app/api/v1/sessions/[sessionId]/attendance/[studentId]/route";
import * as summary from "@/app/api/v1/classes/[classId]/analytics/summary/route";
import * as analyticsStudents from "@/app/api/v1/classes/[classId]/analytics/students/route";
import * as analyticsStudent from "@/app/api/v1/classes/[classId]/analytics/students/[studentId]/route";
import * as trend from "@/app/api/v1/classes/[classId]/analytics/sessions/route";
import * as matrix from "@/app/api/v1/classes/[classId]/analytics/matrix/route";
import * as arrivals from "@/app/api/v1/classes/[classId]/analytics/arrivals/route";
import * as patterns from "@/app/api/v1/classes/[classId]/analytics/patterns/route";
import * as exportCsv from "@/app/api/v1/classes/[classId]/export/attendance.csv/route";
import * as taps from "@/app/api/v1/telemetry/taps/route";
import * as tapsCsv from "@/app/api/v1/telemetry/taps.csv/route";
import * as notificationsCsv from "@/app/api/v1/telemetry/notifications.csv/route";
import * as studentMe from "@/app/api/v1/student/me/route";
import * as studentDevice from "@/app/api/v1/student/device/route";
import * as studentClasses from "@/app/api/v1/student/classes/route";
import * as studentClass from "@/app/api/v1/student/classes/[classId]/route";
import * as studentSessions from "@/app/api/v1/student/sessions/route";
import * as ack from "@/app/api/v1/student/notifications/[notificationId]/ack/route";
import { prisma } from "@/lib/db";
import { notifySession } from "@/lib/notifications";
import { call, FakePhone, resetDb, uuid } from "./helpers";

const MIN = 60_000;
const DAY = 86_400_000;

async function newTeacher(email = "lecturer@uni.lk") {
  const r = await call(teacherRegister.POST, {
    body: { email, password: "correct horse battery", fullName: "Dr. Silva" },
  });
  expect(r.status).toBe(201);
  return r.data as { teacher: { id: string }; accessToken: string; refreshToken: string };
}

async function newPhone() {
  const phone = new FakePhone();
  const r = await call(devices.POST, {
    body: { publicKey: phone.publicKeyB64, hardwareBacked: true, model: "Pixel 7", androidVersion: "15" },
  });
  expect(r.status).toBe(201);
  phone.deviceId = r.data.deviceId;
  return phone;
}

async function studentLogin(phone: FakePhone) {
  const c = await call(challenge.POST, { body: { deviceId: phone.deviceId } });
  const v = await call(verify.POST, { body: { challengeId: c.data.challengeId, signature: phone.signLogin(c.data.nonce) } });
  expect(v.status).toBe(200);
  return v.data as { accessToken: string; refreshToken: string; bound: boolean };
}

async function newClass(token: string, body: Record<string, unknown> = {}) {
  const r = await call(classes.POST, { token, body: { name: "Mobile Computing", code: "CS4473", ...body } });
  expect(r.status).toBe(201);
  return r.data as { id: string };
}

async function enroll(token: string, classId: string, phone: FakePhone, fullName: string, indexNumber: string, extra = {}) {
  return call(enrollments.POST, {
    token,
    params: { classId },
    body: { fullName, indexNumber, proof: phone.tap("ENROLL", classId), ...extra },
  });
}

async function newSession(token: string, classId: string, startsAt: Date, durationMin = 60, name = "Lecture") {
  const r = await call(sessions.POST, {
    token,
    params: { classId },
    body: { name, startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + durationMin * MIN).toISOString() },
  });
  expect(r.status).toBe(201);
  return r.data as { id: string };
}

function record(phone: FakePhone, sessionId: string, hostTime: number) {
  const proof = phone.tap("ATTEND", sessionId, hostTime);
  return {
    clientRecordId: uuid(),
    deviceId: phone.deviceId,
    status: "PRESENT" as const,
    tappedAt: new Date(hostTime).toISOString(),
    proof: { nonce: proof.nonce, hostTime: proof.hostTime, signature: proof.signature },
  };
}

beforeEach(resetDb);

describe("teacher auth", () => {
  it("registers, logs in and reads the profile", async () => {
    await newTeacher();
    const dup = await call(teacherRegister.POST, {
      body: { email: "LECTURER@uni.lk", password: "another password", fullName: "X" },
    });
    expect(dup.status).toBe(409);

    const bad = await call(teacherLogin.POST, { body: { email: "lecturer@uni.lk", password: "nope" } });
    expect(bad.status).toBe(401);
    expect(bad.data.error.code).toBe("INVALID_CREDENTIALS");

    const ok = await call(teacherLogin.POST, { body: { email: "lecturer@uni.lk", password: "correct horse battery" } });
    expect(ok.status).toBe(200);
    const me = await call(teacherMe.GET, { token: ok.data.accessToken });
    expect(me.data).toMatchObject({ email: "lecturer@uni.lk", fullName: "Dr. Silva" });

    expect((await call(teacherMe.GET)).status).toBe(401);
    expect((await call(teacherMe.GET, { token: "garbage" })).status).toBe(401);
  });

  it("rotates refresh tokens and revokes the family on reuse", async () => {
    const t = await newTeacher();
    const r1 = await call(refresh.POST, { body: { refreshToken: t.refreshToken } });
    expect(r1.status).toBe(200);
    const reuse = await call(refresh.POST, { body: { refreshToken: t.refreshToken } });
    expect(reuse.status).toBe(401);
    expect(reuse.data.error.code).toBe("REFRESH_REUSED");
    // The legitimately rotated token is now revoked too.
    const r2 = await call(refresh.POST, { body: { refreshToken: r1.data.refreshToken } });
    expect(r2.status).toBe(401);
  });
});

describe("student device auth", () => {
  it("logs in with a Keystore-style signature and rejects forgeries", async () => {
    const phone = await newPhone();
    const session = await studentLogin(phone);
    expect(session.bound).toBe(false);
    const me = await call(studentMe.GET, { token: session.accessToken });
    expect(me.data).toMatchObject({ deviceId: phone.deviceId, bound: false, student: null });

    // Another key cannot log in as this device.
    const thief = new FakePhone();
    thief.deviceId = phone.deviceId;
    const c = await call(challenge.POST, { body: { deviceId: phone.deviceId } });
    const v = await call(verify.POST, { body: { challengeId: c.data.challengeId, signature: thief.signLogin(c.data.nonce) } });
    expect(v.status).toBe(401);
    expect(v.data.error.code).toBe("BAD_SIGNATURE");

    // Challenges are single-use.
    const c2 = await call(challenge.POST, { body: { deviceId: phone.deviceId } });
    const sig = phone.signLogin(c2.data.nonce);
    expect((await call(verify.POST, { body: { challengeId: c2.data.challengeId, signature: sig } })).status).toBe(200);
    expect((await call(verify.POST, { body: { challengeId: c2.data.challengeId, signature: sig } })).status).toBe(401);
  });

  it("rejects public keys that are not P-256", async () => {
    const r = await call(devices.POST, { body: { publicKey: Buffer.from("not a key").toString("base64url") } });
    expect(r.status).toBe(400);
    expect(r.data.error.code).toBe("INVALID_PUBLIC_KEY");
  });

  it("teacher tokens cannot use student endpoints and vice versa", async () => {
    const t = await newTeacher();
    const phone = await newPhone();
    const s = await studentLogin(phone);
    expect((await call(studentMe.GET, { token: t.accessToken })).status).toBe(403);
    expect((await call(classes.GET, { token: s.accessToken })).status).toBe(403);
  });
});

describe("classes", () => {
  it("isolates classes between teachers", async () => {
    const a = await newTeacher("a@uni.lk");
    const b = await newTeacher("b@uni.lk");
    const cls = await newClass(a.accessToken);
    expect((await call(classOne.GET, { token: b.accessToken, params: { classId: cls.id } })).status).toBe(403);
    expect((await call(classOne.GET, { token: a.accessToken, params: { classId: "not-a-uuid" } })).status).toBe(404);
    const list = await call(classes.GET, { token: b.accessToken });
    expect(list.data.items).toHaveLength(0);

    const patched = await call(classOne.PATCH, {
      token: a.accessToken,
      params: { classId: cls.id },
      method: "PATCH",
      body: { thresholdPct: 75, archived: true },
    });
    expect(patched.data).toMatchObject({ thresholdPct: 75 });
    expect(patched.data.archivedAt).not.toBeNull();
    expect((await call(classes.GET, { token: a.accessToken })).data.items).toHaveLength(0);
    expect((await call(classes.GET, { token: a.accessToken, query: { archived: "true" } })).data.items).toHaveLength(1);
  });
});

describe("enrol by tap", () => {
  it("binds a phone to an index number and enforces the binding rules", async () => {
    const t = await newTeacher();
    const cls = await newClass(t.accessToken);
    const cls2 = await newClass(t.accessToken, { name: "Distributed Systems", code: "CS4262" });
    const phoneA = await newPhone();
    const phoneB = await newPhone();

    const ok = await enroll(t.accessToken, cls.id, phoneA, "Nimal Perera", "200123x");
    expect(ok.status).toBe(201);
    expect(ok.data.student).toMatchObject({ indexNumber: "200123X", fullName: "Nimal Perera" });

    // Same phone + same student in a second class works; mismatched name only warns.
    const second = await enroll(t.accessToken, cls2.id, phoneA, "Nimal P.", "200123X");
    expect(second.status).toBe(201);
    expect(second.data.warnings[0]).toMatch(/registered as "Nimal Perera"/);

    // Already enrolled.
    expect((await enroll(t.accessToken, cls.id, phoneA, "Nimal Perera", "200123X")).data.error.code).toBe("ALREADY_ENROLLED");

    // One phone cannot be two students.
    const other = await enroll(t.accessToken, cls.id, phoneA, "Kamal Silva", "200999K");
    expect(other.status).toBe(409);
    expect(other.data.error.code).toBe("DEVICE_BOUND_TO_OTHER_STUDENT");

    // A student with a linked phone cannot silently get a second one...
    const newPhoneSameStudent = await enroll(t.accessToken, cls.id, phoneB, "Nimal Perera", "200123X");
    expect(newPhoneSameStudent.data.error.code).toBe("STUDENT_HAS_OTHER_DEVICE");

    // ...unless the teacher confirms a replacement; the old phone is then revoked.
    const oldLogin = await studentLogin(phoneA);
    await call(classOne.GET, { token: t.accessToken, params: { classId: cls.id } });
    const cls3 = await newClass(t.accessToken, { name: "Security", code: "CS4300" });
    const replaced = await enroll(t.accessToken, cls3.id, phoneB, "Nimal Perera", "200123X", { replaceDevice: true });
    expect(replaced.status).toBe(201);
    expect(replaced.data.warnings).toContain("The student's previous phone was unlinked.");
    const oldMe = await call(studentMe.GET, { token: oldLogin.accessToken });
    expect(oldMe.status).toBe(401);
    expect(oldMe.data.error.code).toBe("DEVICE_REVOKED");
    expect((await call(refresh.POST, { body: { refreshToken: oldLogin.refreshToken } })).status).toBe(401);

    // Roster keys now carry only the new phone.
    const keys = await call(rosterKeys.GET, { token: t.accessToken, params: { classId: cls.id } });
    expect(keys.data.items).toEqual([expect.objectContaining({ deviceId: phoneB.deviceId, indexNumber: "200123X" })]);
    const cached = await call(rosterKeys.GET, {
      token: t.accessToken,
      params: { classId: cls.id },
      headers: { "if-none-match": keys.headers.get("etag")! },
    });
    expect(cached.status).toBe(304);

    // The new phone now sees all three classes.
    const s = await studentLogin(phoneB);
    expect(s.bound).toBe(true);
    expect((await call(studentClasses.GET, { token: s.accessToken })).data.items).toHaveLength(3);
  });

  it("rejects forged, stale and wrong-context proofs", async () => {
    const t = await newTeacher();
    const cls = await newClass(t.accessToken);
    const other = await newClass(t.accessToken, { name: "Other" });
    const phone = await newPhone();

    const forged = new FakePhone();
    forged.deviceId = phone.deviceId;
    const r1 = await call(enrollments.POST, {
      token: t.accessToken,
      params: { classId: cls.id },
      body: { fullName: "A", indexNumber: "AAA111", proof: forged.tap("ENROLL", cls.id) },
    });
    expect(r1.data.error.code).toBe("BAD_SIGNATURE");

    const r2 = await call(enrollments.POST, {
      token: t.accessToken,
      params: { classId: cls.id },
      body: { fullName: "A", indexNumber: "AAA111", proof: phone.tap("ENROLL", cls.id, Date.now() - 10 * MIN) },
    });
    expect(r2.data.error.code).toBe("STALE_PROOF");

    // A proof made for another class cannot be replayed here.
    const r3 = await call(enrollments.POST, {
      token: t.accessToken,
      params: { classId: cls.id },
      body: { fullName: "A", indexNumber: "AAA111", proof: phone.tap("ENROLL", other.id) },
    });
    expect(r3.data.error.code).toBe("BAD_SIGNATURE");

    // An ATTEND proof cannot be used to enrol (domain separation by purpose byte).
    const r4 = await call(enrollments.POST, {
      token: t.accessToken,
      params: { classId: cls.id },
      body: { fullName: "A", indexNumber: "AAA111", proof: phone.tap("ATTEND", cls.id) },
    });
    expect(r4.data.error.code).toBe("BAD_SIGNATURE");

    const unknown = new FakePhone();
    unknown.deviceId = uuid();
    const r5 = await call(enrollments.POST, {
      token: t.accessToken,
      params: { classId: cls.id },
      body: { fullName: "A", indexNumber: "AAA111", proof: unknown.tap("ENROLL", cls.id) },
    });
    expect(r5.data.error.code).toBe("UNKNOWN_DEVICE");
  });
});

describe("sessions and attendance", () => {
  it("validates, updates and cancels sessions", async () => {
    const t = await newTeacher();
    const cls = await newClass(t.accessToken);
    const bad = await call(sessions.POST, {
      token: t.accessToken,
      params: { classId: cls.id },
      body: { name: "L1", startsAt: "2026-10-06T10:00:00Z", endsAt: "2026-10-06T09:00:00Z" },
    });
    expect(bad.status).toBe(400);

    const series = await call(sessionsBulk.POST, {
      token: t.accessToken,
      params: { classId: cls.id },
      body: {
        name: "Lecture",
        startsAt: "2026-10-06T03:30:00Z",
        endsAt: "2026-10-06T05:30:00Z",
        repeat: { weekly: true, until: "2026-11-03T23:00:00Z" },
      },
    });
    expect(series.status).toBe(201);
    expect(series.data.items.map((s: { name: string }) => s.name)).toEqual([
      "Lecture 1", "Lecture 2", "Lecture 3", "Lecture 4", "Lecture 5",
    ]);

    const range = await call(sessions.GET, {
      token: t.accessToken,
      params: { classId: cls.id },
      query: { from: "2026-10-10T00:00:00Z", to: "2026-10-21T00:00:00Z" },
    });
    expect(range.data.items).toHaveLength(2);

    const id = series.data.items[0].id;
    const patched = await call(sessionOne.PATCH, {
      token: t.accessToken,
      method: "PATCH",
      params: { sessionId: id },
      body: { endsAt: "2026-10-06T03:00:00Z" },
    });
    expect(patched.data.error.code).toBe("INVALID_TIME_RANGE");
    const cancelled = await call(sessionCancel.POST, { token: t.accessToken, method: "POST", params: { sessionId: id } });
    expect(cancelled.data.cancelledAt).not.toBeNull();
  });

  it("re-verifies offline check-ins and computes PRESENT/LATE on the server", async () => {
    const t = await newTeacher();
    const cls = await newClass(t.accessToken, { lateAfterMin: 10, checkInOpensBeforeMin: 15 });
    const [p1, p2, p3, outsider] = await Promise.all([newPhone(), newPhone(), newPhone(), newPhone()]);
    await enroll(t.accessToken, cls.id, p1, "One", "IDX001");
    await enroll(t.accessToken, cls.id, p2, "Two", "IDX002");
    await enroll(t.accessToken, cls.id, p3, "Three", "IDX003");
    const start = new Date(Date.now() - 30 * MIN);
    const session = await newSession(t.accessToken, cls.id, start, 120);

    const onTime = record(p1, session.id, start.getTime() + 2 * MIN);
    const late = { ...record(p2, session.id, start.getTime() + 20 * MIN), status: "PRESENT" as const }; // client lies
    const early = record(p3, session.id, start.getTime() - 30 * MIN);
    const forged = (() => {
      const r = record(p3, session.id, start.getTime() + MIN);
      return { ...r, proof: { ...r.proof, hostTime: r.proof.hostTime + 1 } }; // tampered after signing
    })();
    const notEnrolled = record(outsider, session.id, start.getTime() + MIN);

    const res = await call(batch.POST, {
      token: t.accessToken,
      params: { sessionId: session.id },
      body: { records: [onTime, late, early, forged, notEnrolled] },
    });
    expect(res.status).toBe(200);
    expect(res.data.results.map((r: { result: string; reason?: string }) => r.reason ?? r.result)).toEqual([
      "accepted", "accepted", "OUTSIDE_WINDOW", "BAD_SIGNATURE", "NOT_ENROLLED",
    ]);

    // Retrying the same upload is idempotent; a second tap by the same student is a duplicate.
    const again = await call(batch.POST, {
      token: t.accessToken,
      params: { sessionId: session.id },
      body: { records: [onTime, record(p1, session.id, start.getTime() + 5 * MIN)] },
    });
    expect(again.data.results.map((r: { result: string }) => r.result)).toEqual(["duplicate", "duplicate"]);

    const list = await call(attendance.GET, { token: t.accessToken, params: { sessionId: session.id } });
    const statuses = Object.fromEntries(list.data.items.map((i: { indexNumber: string; status: string }) => [i.indexNumber, i.status]));
    expect(statuses).toEqual({ IDX001: "PRESENT", IDX002: "LATE", IDX003: "ABSENT" });

    // Manual override for the student who forgot their phone.
    const p3Student = list.data.items.find((i: { indexNumber: string }) => i.indexNumber === "IDX003").studentId;
    const m = await call(manual.PUT, {
      token: t.accessToken,
      method: "PUT",
      params: { sessionId: session.id, studentId: p3Student },
      body: { status: "EXCUSED", note: "Medical" },
    });
    expect(m.data).toMatchObject({ status: "EXCUSED", source: "MANUAL" });

    // Another teacher cannot upload into this session.
    const intruder = await newTeacher("intruder@uni.lk");
    const forbidden = await call(batch.POST, {
      token: intruder.accessToken,
      params: { sessionId: session.id },
      body: { records: [record(p1, session.id, start.getTime())] },
    });
    expect(forbidden.status).toBe(403);
  });
});

describe("analytics", () => {
  it("computes per-student percentages, the 80% threshold and projections", async () => {
    const t = await newTeacher();
    const cls = await newClass(t.accessToken);
    const phones = await Promise.all([newPhone(), newPhone(), newPhone()]);
    // Enrol "yesterday" so sessions from earlier today count. Backdate enrolment for past sessions.
    for (const [i, p] of phones.entries()) await enroll(t.accessToken, cls.id, p, `Student ${i}`, `IDX00${i}`);
    await prisma.enrollment.updateMany({ where: { classId: cls.id }, data: { enrolledAt: new Date(Date.now() - 30 * DAY) } });

    // 5 past sessions, 2 future ones.
    const past = [];
    for (let i = 5; i >= 1; i--) past.push(await newSession(t.accessToken, cls.id, new Date(Date.now() - i * DAY), 60, `L${6 - i}`));
    await newSession(t.accessToken, cls.id, new Date(Date.now() + DAY));
    await newSession(t.accessToken, cls.id, new Date(Date.now() + 2 * DAY));

    // Student 0 attends all 5 (one late), student 1 attends 3, student 2 attends 1.
    const attendPlan = [5, 3, 1];
    for (const [si, s] of past.entries()) {
      const startsAt = Date.now() - (5 - si) * DAY;
      const records = phones
        .filter((_, pi) => si < attendPlan[pi]!)
        .map((p, pi) => record(p, s.id, startsAt + (pi === 0 && si === 0 ? 20 : 1) * MIN));
      const r = await call(batch.POST, { token: t.accessToken, params: { sessionId: s.id }, body: { records } });
      expect(r.data.results.every((x: { result: string }) => x.result === "accepted")).toBe(true);
    }

    const sum = await call(summary.GET, { token: t.accessToken, params: { classId: cls.id } });
    expect(sum.data).toMatchObject({
      enrolledCount: 3,
      sessionsHeld: 5,
      sessionsRemaining: 2,
      belowThresholdCount: 2,
      classAvgPct: 60, // 9 / 15
      statusSplit: { present: 8, late: 1, excused: 0, absent: 6 },
    });

    const rows = (await call(analyticsStudents.GET, { token: t.accessToken, params: { classId: cls.id } })).data.items;
    expect(rows.map((r: { indexNumber: string; pct: number }) => [r.indexNumber, r.pct])).toEqual([
      ["IDX002", 20],
      ["IDX001", 60],
      ["IDX000", 100],
    ]);
    // IDX001: (3+k)/(5+k) >= .8 needs k=5 > 2 remaining -> unreachable; max = 5/7.
    expect(rows[1]).toMatchObject({ belowThreshold: true, sessionsNeeded: null, maxAchievablePct: 71.4 });

    const detail = await call(analyticsStudent.GET, {
      token: t.accessToken,
      params: { classId: cls.id, studentId: rows[2].studentId },
    });
    expect(detail.data).toMatchObject({ pct: 100, longestStreak: 5, currentStreak: 5 });
    expect(detail.data.timeline[0]).toMatchObject({ status: "LATE", minutesFromStart: 20 });

    const tr = await call(trend.GET, { token: t.accessToken, params: { classId: cls.id } });
    expect(tr.data.items.map((i: { count: number }) => i.count)).toEqual([3, 2, 2, 1, 1]);

    const mx = await call(matrix.GET, { token: t.accessToken, params: { classId: cls.id } });
    expect(mx.data.cells[2]).toEqual(["PRESENT", "ABSENT", "ABSENT", "ABSENT", "ABSENT"]);

    const arr = await call(arrivals.GET, { token: t.accessToken, params: { classId: cls.id } });
    expect(arr.data.bins.reduce((n: number, b: { count: number }) => n + b.count, 0)).toBe(9);

    const pat = await call(patterns.GET, { token: t.accessToken, params: { classId: cls.id }, query: { tz: "Asia/Colombo" } });
    expect(pat.data.byWeekday).toHaveLength(7);
    expect((await call(patterns.GET, { token: t.accessToken, params: { classId: cls.id }, query: { tz: "Mars/Base" } })).status).toBe(400);

    const csv = await call(exportCsv.GET, { token: t.accessToken, params: { classId: cls.id }, query: { pseudonymise: "true" } });
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.data).not.toContain("IDX000");
    expect(csv.data.trim().split("\n")).toHaveLength(4);

    const r = await call(roster.GET, { token: t.accessToken, params: { classId: cls.id } });
    expect(r.data.items.map((i: { attendancePct: number }) => i.attendancePct)).toEqual([100, 60, 20]);

    // Student view of the same class.
    const s = await studentLogin(phones[1]!);
    const detailForStudent = await call(studentClass.GET, { token: s.accessToken, params: { classId: cls.id } });
    expect(detailForStudent.data).toMatchObject({ attendancePct: 60, sessionsNeeded: null, maxAchievablePct: 71.4 });
    expect(detailForStudent.data.history.map((h: { status: string }) => h.status)).toEqual([
      "UPCOMING", "UPCOMING", "ABSENT", "ABSENT", "PRESENT", "PRESENT", "PRESENT",
    ]);
    const upcoming = await call(studentSessions.GET, { token: s.accessToken });
    expect(upcoming.data.items).toHaveLength(2);
  });
});

describe("notifications and telemetry", () => {
  it("logs reminders per device and records delivery acks", async () => {
    const t = await newTeacher();
    const cls = await newClass(t.accessToken);
    const phone = await newPhone();
    await enroll(t.accessToken, cls.id, phone, "Push Test", "PUSH01");
    const s = await studentLogin(phone);
    expect(
      (await call(studentDevice.PUT, { token: s.accessToken, method: "PUT", body: { fcmToken: "fcm-token-123" } })).status,
    ).toBe(204);

    const session = await newSession(t.accessToken, cls.id, new Date(Date.now() + 20 * MIN));
    expect(await notifySession(session.id, "REMINDER_30")).toBe(1);
    expect(await notifySession(session.id, "REMINDER_30")).toBe(0); // idempotent per device

    const log = await prisma.notificationLog.findFirstOrThrow({ where: { sessionId: session.id } });
    expect(log.sentAt).not.toBeNull();
    const receivedAt = new Date().toISOString();
    expect(
      (await call(ack.POST, { token: s.accessToken, params: { notificationId: log.id }, body: { receivedAt } })).status,
    ).toBe(204);
    const csv = await call(notificationsCsv.GET, { token: t.accessToken });
    expect(csv.data).toContain("REMINDER_30");
  });

  it("ingests tap telemetry idempotently and exports CSV", async () => {
    const t = await newTeacher();
    const event = {
      clientEventId: uuid(),
      hostModel: "Pixel 7 / Android 15",
      purpose: "ATTEND",
      outcome: "OK",
      discoveredAt: new Date().toISOString(),
      tSelectMs: 18.2,
      tAuthMs: 61.5,
      tVerifyMs: 2.1,
      tTotalMs: 95.4,
      conditions: { runId: "run-1", screenState: "locked", studentPhone: "Galaxy A54" },
    };
    const first = await call(taps.POST, { token: t.accessToken, body: { events: [event] } });
    expect(first.data).toEqual({ accepted: 1, duplicates: 0 });
    const second = await call(taps.POST, { token: t.accessToken, body: { events: [event] } });
    expect(second.data).toEqual({ accepted: 0, duplicates: 1 });

    const filtered = await call(taps.GET, { token: t.accessToken, query: { runId: "run-1" } });
    expect(filtered.data.items).toHaveLength(1);
    expect((await call(taps.GET, { token: t.accessToken, query: { runId: "run-2" } })).data.items).toHaveLength(0);

    const csv = await call(tapsCsv.GET, { token: t.accessToken });
    expect(csv.data.split("\n")[1]).toContain("locked");
  });
});
