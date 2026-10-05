import type { EnrollResultDto } from "@attendance/shared";
import type { z } from "zod";
import type { EnrollBody } from "@attendance/shared";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { ApiError } from "./http";
import { verifyNfcProof } from "./proof";
import { enqueuePush } from "./jobs";
import { revokeAllForSubject } from "./auth";

export const MAX_PROOF_AGE_MS = 5 * 60_000;

type Body = z.output<typeof EnrollBody>;

/**
 * Enrol-by-tap: verify the ENROLL proof, then apply the binding rules from
 * docs/IDENTITY_AND_AUTH.md §1.3 (one ACTIVE device per student, one student per device).
 */
export async function enrollByTap(cls: { id: string; archivedAt: Date | null }, body: Body): Promise<EnrollResultDto> {
  if (cls.archivedAt) throw new ApiError(409, "CLASS_ARCHIVED", "Class is archived");
  const { proof } = body;

  const device = await prisma.studentDevice.findUnique({ where: { id: proof.deviceId } });
  if (!device) throw new ApiError(422, "UNKNOWN_DEVICE", "This phone is not registered. Open the student app first.");
  if (device.status !== "ACTIVE") throw new ApiError(409, "DEVICE_REVOKED", "This phone was replaced by another device");
  if (Math.abs(Date.now() - proof.hostTime) > MAX_PROOF_AGE_MS) {
    throw new ApiError(422, "STALE_PROOF", "Tap proof is too old or the host clock is wrong");
  }
  if (!verifyNfcProof("ENROLL", cls.id, proof, device.publicKey)) {
    throw new ApiError(422, "BAD_SIGNATURE", "Tap signature is invalid");
  }

  const warnings: string[] = [];
  let revokedDeviceId: string | null = null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      let student = await tx.student.findUnique({ where: { indexNumber: body.indexNumber } });

      if (device.studentId && device.studentId !== student?.id) {
        const owner = await tx.student.findUnique({ where: { id: device.studentId } });
        throw new ApiError(409, "DEVICE_BOUND_TO_OTHER_STUDENT", "This phone already belongs to another student", {
          indexNumber: owner?.indexNumber,
        });
      }

      if (student) {
        if (student.fullName.trim().toLowerCase() !== body.fullName.trim().toLowerCase()) {
          warnings.push(`Index ${student.indexNumber} is registered as "${student.fullName}"; the stored name was kept.`);
        }
        const other = await tx.studentDevice.findFirst({
          where: { studentId: student.id, status: "ACTIVE", id: { not: device.id } },
        });
        if (other) {
          if (!body.replaceDevice) {
            throw new ApiError(409, "STUDENT_HAS_OTHER_DEVICE", "This student already has another phone linked", {
              deviceModel: other.model,
            });
          }
          await tx.studentDevice.update({
            where: { id: other.id },
            data: { status: "REVOKED", revokedAt: new Date(), fcmToken: null },
          });
          revokedDeviceId = other.id;
          warnings.push("The student's previous phone was unlinked.");
        }
      } else {
        student = await tx.student.create({ data: { indexNumber: body.indexNumber, fullName: body.fullName } });
      }

      if (!device.studentId) {
        await tx.studentDevice.update({ where: { id: device.id }, data: { studentId: student.id, boundAt: new Date() } });
      }

      const existing = await tx.enrollment.findUnique({
        where: { classId_studentId: { classId: cls.id, studentId: student.id } },
      });
      let enrollment;
      if (existing && !existing.removedAt) {
        throw new ApiError(409, "ALREADY_ENROLLED", `${student.fullName} is already enrolled in this class`);
      } else if (existing) {
        enrollment = await tx.enrollment.update({
          where: { classId_studentId: { classId: cls.id, studentId: student.id } },
          data: { removedAt: null, enrolledDeviceId: device.id },
        });
      } else {
        enrollment = await tx.enrollment.create({
          data: { classId: cls.id, studentId: student.id, enrolledDeviceId: device.id },
        });
      }
      return { student, enrollment };
    });

    if (revokedDeviceId) {
      await revokeAllForSubject("STUDENT_DEVICE", revokedDeviceId);
      await enqueuePush({ type: "DEVICE_REVOKED", deviceId: revokedDeviceId });
    }
    await enqueuePush({ type: "ENROLLED", deviceId: device.id, classId: cls.id });

    return {
      student: { id: result.student.id, indexNumber: result.student.indexNumber, fullName: result.student.fullName },
      enrollment: { enrolledAt: result.enrollment.enrolledAt.toISOString() },
      warnings,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiError(409, "CONFLICT", "Concurrent enrolment detected; please tap again");
    }
    throw err;
  }
}
