import { ChallengeBody } from "@attendance/shared";
import { prisma } from "@/lib/db";
import { b64url, random } from "@/lib/crypto";
import { ApiError, handler, json, parseBody } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const { deviceId } = await parseBody(req, ChallengeBody);
  rateLimit(`challenge:${deviceId}`, 30, 15 * 60_000);
  const device = await prisma.studentDevice.findUnique({ where: { id: deviceId } });
  if (!device) throw new ApiError(404, "UNKNOWN_DEVICE", "Device is not registered");
  if (device.status !== "ACTIVE") throw new ApiError(401, "DEVICE_REVOKED", "This device is no longer linked");
  const nonce = random(32);
  const challenge = await prisma.authChallenge.create({
    data: { deviceId, nonce, expiresAt: new Date(Date.now() + 2 * 60_000) },
  });
  return json({ challengeId: challenge.id, nonce: b64url.encode(nonce), expiresAt: challenge.expiresAt.toISOString() });
});
