import { buildLoginMessage, VerifyBody } from "@attendance/shared";
import { issueTokens } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { b64url, verifyEs256 } from "@/lib/crypto";
import { ApiError, handler, json, parseBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Device-bound login: the phone signs "ATTv1-LOGIN" || deviceId || nonce with its Keystore key. */
export const POST = handler(async (req) => {
  const body = await parseBody(req, VerifyBody);
  const challenge = await prisma.authChallenge.findUnique({
    where: { id: body.challengeId },
    include: { device: { include: { student: true } } },
  });
  if (!challenge || challenge.usedAt || challenge.expiresAt < new Date()) {
    throw new ApiError(401, "INVALID_CHALLENGE", "Challenge is invalid or expired");
  }
  const { device } = challenge;
  if (device.status !== "ACTIVE") throw new ApiError(401, "DEVICE_REVOKED", "This device is no longer linked");
  const message = buildLoginMessage(device.id, challenge.nonce);
  if (!verifyEs256(device.publicKey, message, b64url.decode(body.signature))) {
    throw new ApiError(401, "BAD_SIGNATURE", "Signature verification failed");
  }
  const { count } = await prisma.authChallenge.updateMany({
    where: { id: challenge.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count === 0) throw new ApiError(401, "INVALID_CHALLENGE", "Challenge already used");
  await prisma.studentDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });

  const tokens = await issueTokens("STUDENT_DEVICE", device.id);
  return json({
    ...tokens,
    bound: !!device.student,
    student: device.student
      ? { id: device.student.id, indexNumber: device.student.indexNumber, fullName: device.student.fullName }
      : null,
  });
});
