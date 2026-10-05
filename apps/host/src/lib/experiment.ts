import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import type { TapEventInput } from "@attendance/shared";
import type { TapEvent } from "../../modules/nfc-reader";
import { insertTapEvent } from "./db";

/**
 * Experiment mode (docs/PLAN.md §8): the lecturer/tester labels the current conditions and every tap is
 * logged with them. Taps are always logged; labels are attached only while experiment mode is on.
 */
export interface Conditions {
  enabled: boolean;
  runId: string;
  studentPhone: string;
  screenState: "unlocked-foreground" | "unlocked-app-killed" | "locked-screen-on" | "screen-off" | "";
  appState: string;
  case: "no-case" | "case" | "";
  orientation: "back-to-back-centred" | "offset" | "";
  notes: string;
}

export const defaultConditions: Conditions = {
  enabled: false,
  runId: "run-1",
  studentPhone: "",
  screenState: "",
  appState: "",
  case: "",
  orientation: "",
  notes: "",
};

const KEY = "experiment_conditions";
let cache: Conditions | null = null;

export async function getConditions(): Promise<Conditions> {
  if (cache) return cache;
  const raw = await SecureStore.getItemAsync(KEY);
  cache = raw ? { ...defaultConditions, ...JSON.parse(raw) } : defaultConditions;
  return cache!;
}

export async function saveConditions(c: Conditions) {
  cache = c;
  await SecureStore.setItemAsync(KEY, JSON.stringify(c));
}

export const hostModel = () =>
  `${Device.manufacturer ?? ""} ${Device.modelName ?? "unknown"} / Android ${Device.osVersion ?? "?"}`.trim();

/** Pseudonymous device id for telemetry (the brief asks us to hash device identifiers). */
async function hashId(deviceId: string) {
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${deviceId}:attendance-telemetry`);
  return hex.slice(0, 16);
}

/** Stores one tap attempt for upload to /telemetry/taps. */
export async function recordTap(e: TapEvent, outcomeOverride?: TapEventInput["outcome"]) {
  const c = await getConditions();
  const outcome = outcomeOverride ?? (e.outcome === "PENDING" ? "PROTOCOL_ERROR" : e.outcome);
  const conditions: Record<string, string> | null = c.enabled
    ? Object.fromEntries(
        Object.entries({
          runId: c.runId,
          studentPhone: c.studentPhone,
          screenState: c.screenState,
          appState: c.appState,
          case: c.case,
          orientation: c.orientation,
          notes: c.notes,
        }).filter(([, v]) => v !== ""),
      )
    : null;
  const event: TapEventInput = {
    clientEventId: e.tapId ?? Crypto.randomUUID(),
    hostModel: hostModel(),
    purpose: e.purpose,
    contextId: e.contextId ?? null,
    deviceIdHash: e.deviceId ? await hashId(e.deviceId) : null,
    outcome,
    discoveredAt: new Date(e.discoveredAt).toISOString(),
    tSelectMs: e.tSelectMs ?? null,
    tAuthMs: e.tAuthMs ?? null,
    tVerifyMs: e.tVerifyMs ?? null,
    tTotalMs: e.tTotalMs ?? null,
    conditions,
    errorDetail: e.errorDetail ?? null,
  };
  await insertTapEvent(event.clientEventId, event);
}
