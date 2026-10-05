import { buildNfcProofMessage, type PurposeName } from "@attendance/shared";
import { b64url, verifyEs256 } from "./crypto";
import { ApiError } from "./http";

export interface ProofInput {
  deviceId: string;
  nonce: string;
  hostTime: number;
  signature: string;
}

/** Verifies an NFC tap proof (docs/IDENTITY_AND_AUTH.md §2) against the device's public key. */
export function verifyNfcProof(purpose: PurposeName, contextId: string, proof: ProofInput, publicKey: Uint8Array): boolean {
  const nonce = b64url.decode(proof.nonce);
  if (nonce.length !== 16) throw new ApiError(400, "VALIDATION_ERROR", "Proof nonce must be 16 bytes");
  const message = buildNfcProofMessage({
    purpose,
    contextId,
    nonce,
    hostTime: proof.hostTime,
    deviceId: proof.deviceId,
  });
  return verifyEs256(publicKey, message, b64url.decode(proof.signature));
}
