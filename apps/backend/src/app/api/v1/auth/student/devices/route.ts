import { DeviceRegisterBody } from "@attendance/shared";
import { prisma } from "@/lib/db";
import { assertP256PublicKey, b64url } from "@/lib/crypto";
import { ApiError, clientIp, handler, json, parseBody } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Registers a new student phone (its Keystore public key). Binding to a person happens at enrolment. */
export const POST = handler(async (req) => {
  rateLimit(`device-register:${clientIp(req)}`, 30, 60 * 60_000);
  const body = await parseBody(req, DeviceRegisterBody);
  const publicKey = b64url.decode(body.publicKey);
  try {
    assertP256PublicKey(publicKey);
  } catch {
    throw new ApiError(400, "INVALID_PUBLIC_KEY", "publicKey must be an EC P-256 SubjectPublicKeyInfo");
  }
  const device = await prisma.studentDevice.create({
    data: {
      publicKey,
      keyAlgorithm: body.keyAlgorithm,
      hardwareBacked: body.hardwareBacked,
      manufacturer: body.manufacturer,
      model: body.model,
      androidVersion: body.androidVersion,
      appVersion: body.appVersion,
    },
  });
  return json({ deviceId: device.id }, 201);
});
