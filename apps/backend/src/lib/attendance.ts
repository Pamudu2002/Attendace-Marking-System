import { randomUUID } from "node:crypto";
import { checkInVerdict, type BatchResultDto } from "@attendance/shared";
import type { z } from "zod";
import type { AttendanceBatchBody, ManualAttendanceBody } from "@attendance/shared";
import { Prisma, type Class, type ClassSession } from "@/generated/prisma/client";
import { prisma } from "./db";
import { b64url } from "./crypto";
import { ApiError } from "./http";
import { verifyNfcProof } from "./proof";

type Batch = z.output<typeof AttendanceBatchBody>;
type SessionWithClass = ClassSession & { class: Class };

/**
 * Offline-sync upload from the host app. Every record is re-verified server-side
 * (docs/IDENTITY_AND_AUTH.md §3.3); retries are idempotent through clientRecordId.
 */
export async function ingestBatch(session: SessionWithClass, teacherId: string, batch: Batch): Promise<BatchResultDto> {
  const deviceIds = [...new Set(batch.records.map((r) => r.deviceId))];
  const [devices, existing] = await Promise.all([
    prisma.studentDevice.findMany({
      where: { id: { in: deviceIds } },
      select: { id: true, publicKey: true, studentId: true, status: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { clientRecordId: { in: batch.records.map((r) => r.clientRecordId) } },
      select: { clientRecordId: true },
    }),
  ]);
  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const seen = new Set(existing.map((e) => e.clientRecordId));
  const studentIds = devices.flatMap((d) => (d.studentId ? [d.studentId] : []));
  const enrolled = new Set(
    (
      await prisma.enrollment.findMany({
        where: { classId: session.classId, studentId: { in: studentIds }, removedAt: null },
        select: { studentId: true },
      })
    ).map((e) => e.studentId),
  );

  const results: BatchResultDto["results"] = [];
  for (const r of batch.records) {
    const reject = (reason: string) => results.push({ clientRecordId: r.clientRecordId, result: "rejected", reason });
    if (seen.has(r.clientRecordId)) {
      results.push({ clientRecordId: r.clientRecordId, result: "duplicate" });
      continue;
    }
    if (session.cancelledAt) {
      reject("SESSION_CANCELLED");
      continue;
    }
    const device = deviceById.get(r.deviceId);
    if (!device) {
      reject("UNKNOWN_DEVICE");
      continue;
    }
    if (device.status !== "ACTIVE") {
      reject("DEVICE_REVOKED");
      continue;
    }
    if (!device.studentId || !enrolled.has(device.studentId)) {
      reject("NOT_ENROLLED");
      continue;
    }
    if (!verifyNfcProof("ATTEND", session.id, { deviceId: r.deviceId, ...r.proof }, device.publicKey)) {
      reject("BAD_SIGNATURE");
      continue;
    }
    const tappedAt = new Date(r.proof.hostTime);
    const verdict = checkInVerdict(
      {
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        checkInOpensBeforeMin: session.class.checkInOpensBeforeMin,
        lateAfterMin: session.class.lateAfterMin,
      },
      tappedAt,
    );
    if (verdict === "OUTSIDE_WINDOW") {
      reject("OUTSIDE_WINDOW");
      continue;
    }
    try {
      await prisma.attendanceRecord.create({
        data: {
          clientRecordId: r.clientRecordId,
          sessionId: session.id,
          studentId: device.studentId,
          deviceId: device.id,
          status: verdict,
          source: "NFC",
          tappedAt,
          hostTime: BigInt(r.proof.hostTime),
          nonce: b64url.decode(r.proof.nonce),
          signature: b64url.decode(r.proof.signature),
          markedById: teacherId,
        },
      });
      seen.add(r.clientRecordId);
      results.push({ clientRecordId: r.clientRecordId, result: "accepted" });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Student already has a record for this session (e.g. tapped twice on two queues).
        results.push({ clientRecordId: r.clientRecordId, result: "duplicate" });
      } else {
        throw err;
      }
    }
  }
  return { results };
}

export async function setManualAttendance(
  session: SessionWithClass,
  studentId: string,
  teacherId: string,
  body: z.output<typeof ManualAttendanceBody>,
) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { classId_studentId: { classId: session.classId, studentId } },
  });
  if (!enrollment || enrollment.removedAt) throw new ApiError(404, "NOT_FOUND", "Student is not enrolled in this class");
  return prisma.attendanceRecord.upsert({
    where: { sessionId_studentId: { sessionId: session.id, studentId } },
    create: {
      clientRecordId: randomUUID(),
      sessionId: session.id,
      studentId,
      status: body.status,
      source: "MANUAL",
      tappedAt: new Date(),
      markedById: teacherId,
      note: body.note,
    },
    update: { status: body.status, source: "MANUAL", note: body.note, markedById: teacherId },
  });
}
