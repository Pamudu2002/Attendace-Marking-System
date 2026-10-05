import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT, errors as joseErrors } from "jose";
import type { NextRequest } from "next/server";
import type { Role, TokenPair } from "@attendance/shared";
import { prisma } from "./db";
import { env } from "./env";
import { ApiError } from "./http";
import { random, sha256Hex } from "./crypto";

const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_DAYS = { TEACHER: 30, STUDENT_DEVICE: 180 } as const;
type SubjectType = keyof typeof REFRESH_TTL_DAYS;

const roleOf: Record<SubjectType, Role> = { TEACHER: "teacher", STUDENT_DEVICE: "student_device" };

const secretKey = () => new TextEncoder().encode(env.jwtSecret);

// ---- Passwords -------------------------------------------------------------

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
let dummyHash: Promise<string> | null = null;

export const hashPassword = (password: string) => argonHash(password, ARGON);

export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  // Always run one verification so response time does not reveal whether the email exists.
  dummyHash ??= argonHash("dummy-password-for-timing", ARGON);
  return argonVerify(stored ?? (await dummyHash), password);
}

// ---- Tokens ----------------------------------------------------------------

export interface AccessClaims {
  sub: string;
  role: Role;
  fam: string;
}

async function signAccessToken(c: AccessClaims): Promise<string> {
  return new SignJWT({ role: c.role, fam: c.fam })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(secretKey());
}

export async function issueTokens(subjectType: SubjectType, subjectId: string, familyId: string = randomUUID()): Promise<TokenPair> {
  const refreshToken = random(32).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      subjectType,
      subjectId,
      familyId,
      tokenHash: sha256Hex(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS[subjectType] * 86_400_000),
    },
  });
  const accessToken = await signAccessToken({ sub: subjectId, role: roleOf[subjectType], fam: familyId });
  return { accessToken, refreshToken };
}

/** Rotates a refresh token. Presenting an already-rotated token revokes the whole family. */
export async function rotateRefreshToken(refreshToken: string): Promise<TokenPair> {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256Hex(refreshToken) } });
  if (!row) throw new ApiError(401, "UNAUTHENTICATED", "Invalid refresh token");
  if (row.revokedAt) {
    await revokeFamily(row.familyId);
    throw new ApiError(401, "REFRESH_REUSED", "Refresh token reuse detected; please sign in again");
  }
  if (row.expiresAt < new Date()) throw new ApiError(401, "TOKEN_EXPIRED", "Refresh token expired");

  if (row.subjectType === "STUDENT_DEVICE") {
    const device = await prisma.studentDevice.findUnique({ where: { id: row.subjectId } });
    if (!device || device.status !== "ACTIVE") throw new ApiError(401, "DEVICE_REVOKED", "This device is no longer linked");
  }

  // Conditional update so two concurrent refreshes cannot both succeed.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) {
    await revokeFamily(row.familyId);
    throw new ApiError(401, "REFRESH_REUSED", "Refresh token reuse detected; please sign in again");
  }
  return issueTokens(row.subjectType, row.subjectId, row.familyId);
}

export async function revokeRefreshToken(refreshToken: string, subjectId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256Hex(refreshToken), subjectId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeFamily(familyId: string) {
  await prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllForSubject(subjectType: SubjectType, subjectId: string) {
  await prisma.refreshToken.updateMany({
    where: { subjectType, subjectId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ---- Request guards --------------------------------------------------------

export async function authenticate(req: NextRequest): Promise<AccessClaims> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/i.exec(header);
  if (!match?.[1]) throw new ApiError(401, "UNAUTHENTICATED", "Missing bearer token");
  try {
    const { payload } = await jwtVerify(match[1], secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || (payload.role !== "teacher" && payload.role !== "student_device")) {
      throw new ApiError(401, "UNAUTHENTICATED", "Malformed token");
    }
    return { sub: payload.sub, role: payload.role, fam: String(payload.fam ?? "") };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof joseErrors.JWTExpired) throw new ApiError(401, "TOKEN_EXPIRED", "Access token expired");
    throw new ApiError(401, "UNAUTHENTICATED", "Invalid access token");
  }
}

export async function requireTeacher(req: NextRequest): Promise<{ teacherId: string }> {
  const claims = await authenticate(req);
  if (claims.role !== "teacher") throw new ApiError(403, "FORBIDDEN", "Teacher access required");
  return { teacherId: claims.sub };
}

export interface DeviceContext {
  deviceId: string;
  studentId: string | null;
}

export async function requireStudentDevice(req: NextRequest): Promise<DeviceContext> {
  const claims = await authenticate(req);
  if (claims.role !== "student_device") throw new ApiError(403, "FORBIDDEN", "Student device access required");
  const device = await prisma.studentDevice.findUnique({
    where: { id: claims.sub },
    select: { id: true, studentId: true, status: true, lastSeenAt: true },
  });
  if (!device || device.status !== "ACTIVE") throw new ApiError(401, "DEVICE_REVOKED", "This device is no longer linked");
  if (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.studentDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  }
  return { deviceId: device.id, studentId: device.studentId };
}
