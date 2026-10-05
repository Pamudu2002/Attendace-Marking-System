import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { env } from "./env";

export const b64url = {
  encode: (b: Uint8Array) => Buffer.from(b).toString("base64url"),
  decode: (s: string) => Buffer.from(s, "base64url"),
};

export const random = (n: number) => randomBytes(n);

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Pseudonymous device id used in exports and telemetry. */
export function hashDeviceId(deviceId: string): string {
  return sha256Hex(`${deviceId}:${env.exportHashSalt}`).slice(0, 16);
}

/** Validates that `spki` is a DER SubjectPublicKeyInfo for an EC P-256 key. */
export function assertP256PublicKey(spki: Uint8Array): void {
  const key = createPublicKey({ key: Buffer.from(spki), format: "der", type: "spki" });
  const details = key.asymmetricKeyDetails;
  if (key.asymmetricKeyType !== "ec" || details?.namedCurve !== "prime256v1") {
    throw new Error("Public key must be EC P-256");
  }
}

/** ECDSA P-256 / SHA-256 verification of an ASN.1 DER signature (Android default). */
export function verifyEs256(spki: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(spki), format: "der", type: "spki" });
    return verify("sha256", message, { key, dsaEncoding: "der" }, signature);
  } catch {
    return false;
  }
}
