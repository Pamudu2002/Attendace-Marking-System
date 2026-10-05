import { describe, expect, it } from "vitest";
import { attendancePct, checkInVerdict, maxAchievablePct, sessionsNeeded } from "./attendance";
import { buildNfcProofMessage, bytesToUuid, uuidToBytes } from "./protocol";

describe("attendance maths", () => {
  it("computes percentages", () => {
    expect(attendancePct(8, 10)).toBe(80);
    expect(attendancePct(0, 0)).toBeNull();
    expect(maxAchievablePct(5, 10, 5)).toBeCloseTo(66.7);
  });

  it("computes sessions needed to reach the threshold", () => {
    expect(sessionsNeeded(8, 10, 5, 80)).toBe(0);
    // (7+k)/(10+k) >= 0.8 -> k >= 5
    expect(sessionsNeeded(7, 10, 5, 80)).toBe(5);
    expect(sessionsNeeded(7, 10, 4, 80)).toBeNull();
    expect(sessionsNeeded(0, 0, 3, 80)).toBe(0);
  });

  it("classifies taps against the session window", () => {
    const w = {
      startsAt: new Date("2026-10-06T08:00:00Z"),
      endsAt: new Date("2026-10-06T10:00:00Z"),
      checkInOpensBeforeMin: 15,
      lateAfterMin: 15,
    };
    expect(checkInVerdict(w, new Date("2026-10-06T07:40:00Z"))).toBe("OUTSIDE_WINDOW");
    expect(checkInVerdict(w, new Date("2026-10-06T07:50:00Z"))).toBe("PRESENT");
    expect(checkInVerdict(w, new Date("2026-10-06T08:15:00Z"))).toBe("PRESENT");
    expect(checkInVerdict(w, new Date("2026-10-06T08:16:00Z"))).toBe("LATE");
    expect(checkInVerdict(w, new Date("2026-10-06T10:01:00Z"))).toBe("OUTSIDE_WINDOW");
  });
});

describe("protocol", () => {
  it("round-trips UUIDs", () => {
    const id = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
    expect(bytesToUuid(uuidToBytes(id))).toBe(id);
  });

  it("builds the NFC proof message with the documented layout", () => {
    const msg = buildNfcProofMessage({
      purpose: "ATTEND",
      contextId: "00000000-0000-0000-0000-000000000001",
      nonce: new Uint8Array(16).fill(7),
      hostTime: 0x0102030405n,
      deviceId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    });
    expect(msg.length).toBe(9 + 1 + 16 + 16 + 8 + 16);
    expect(new TextDecoder().decode(msg.slice(0, 9))).toBe("ATTv1-NFC");
    expect(msg[9]).toBe(0x02);
    expect(Array.from(msg.slice(42, 50))).toEqual([0, 0, 0, 1, 2, 3, 4, 5]);
  });
});
