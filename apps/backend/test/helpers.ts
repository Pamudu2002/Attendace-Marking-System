import { generateKeyPairSync, randomBytes, randomUUID, sign, type KeyObject } from "node:crypto";
import { NextRequest } from "next/server";
import { buildLoginMessage, buildNfcProofMessage, type PurposeName } from "@attendance/shared";
import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: NextRequest, ctx: { params: Promise<any> }) => Promise<Response>;

export interface CallOptions {
  method?: string;
  body?: unknown;
  token?: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

/** Invokes a Next.js route handler directly and parses JSON responses. */
export async function call<T = any>(handler: Handler, opts: CallOptions = {}) {
  const url = new URL("http://test.local/api");
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const req = new NextRequest(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("application/json") && text ? JSON.parse(text) : text;
  return { status: res.status, data: data as T, headers: res.headers };
}

export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE notification_log, tap_event, attendance_record, class_session, enrollment,
             class, auth_challenge, student_device, student, refresh_token, teacher CASCADE`);
}

/** Simulates a student phone: an EC P-256 key pair like the Android Keystore one. */
export class FakePhone {
  readonly privateKey: KeyObject;
  readonly publicKeyB64: string;
  deviceId = "";

  constructor() {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    this.privateKey = privateKey;
    this.publicKeyB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64url");
  }

  signLogin(nonceB64: string): string {
    const msg = buildLoginMessage(this.deviceId, Buffer.from(nonceB64, "base64url"));
    return sign("sha256", msg, this.privateKey).toString("base64url");
  }

  /** What the HCE service returns to the reader during a tap. */
  tap(purpose: PurposeName, contextId: string, hostTime = Date.now()) {
    const nonce = randomBytes(16);
    const msg = buildNfcProofMessage({ purpose, contextId, nonce, hostTime, deviceId: this.deviceId });
    return {
      deviceId: this.deviceId,
      nonce: nonce.toString("base64url"),
      hostTime,
      signature: sign("sha256", msg, this.privateKey).toString("base64url"),
    };
  }
}

export const uuid = () => randomUUID();
