import { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { EnrollResultDto, TapOutcome } from "@attendance/shared";
import { ApiError, Banner, Body, Button, Card, errorMessage, Field, H2, Screen, usePalette } from "@attendance/mobile-core";
import { ConfirmResult, NfcReader, type TapEvent } from "../../../../modules/nfc-reader";
import { api } from "@/lib/api";
import { recordTap } from "@/lib/experiment";
import { qk, useClass } from "@/lib/queries";

type Phase =
  | { kind: "form" }
  | { kind: "waiting" }
  | { kind: "submitting" }
  | { kind: "done"; tone: "good" | "bad" | "warn"; message: string };

const READER_ERRORS: Record<string, string> = {
  STUDENT_APP_NOT_INSTALLED: "The other phone doesn't have the student app installed.",
  STUDENT_APP_NOT_REGISTERED: "The student app hasn't finished setting up. Open it once with internet, then tap again.",
};

/**
 * Enrol by tap (docs/IDENTITY_AND_AUTH.md §3.4): the teacher types name + index number, the student's phone
 * signs an ENROLL proof over NFC, and the server binds that phone to the index number.
 */
export default function EnrollScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const cls = useClass(classId);
  const qc = useQueryClient();
  const c = usePalette();
  const [fullName, setFullName] = useState("");
  const [indexNumber, setIndexNumber] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const form = useRef({ fullName, indexNumber });
  form.current = { fullName, indexNumber };
  const label = cls.data ? (cls.data.code ?? cls.data.name) : "class";
  const labelRef = useRef(label);
  labelRef.current = label;

  useEffect(() => {
    const sub = NfcReader.onEnrollProof((e) => handleProof(e));
    return () => {
      sub.remove();
      NfcReader.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: TapEvent, replaceDevice: boolean): Promise<EnrollResultDto> {
    return api.post<EnrollResultDto>(`/classes/${classId}/enrollments`, {
      fullName: form.current.fullName.trim(),
      indexNumber: form.current.indexNumber.trim(),
      replaceDevice,
      proof: { deviceId: e.deviceId, nonce: e.nonce, hostTime: e.hostTime, signature: e.signature },
    });
  }

  function succeeded(r: EnrollResultDto) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase({
      kind: "done",
      tone: r.warnings.length ? "warn" : "good",
      message: [`${r.student.fullName} (${r.student.indexNumber}) enrolled.`, ...r.warnings].join("\n"),
    });
    setFullName("");
    setIndexNumber("");
    qc.invalidateQueries({ queryKey: qk.class(classId) });
  }

  async function handleProof(e: TapEvent) {
    // One student per "Ready" press; the delay lets the CONFIRM reach the student's phone first.
    const stopSoon = () => setTimeout(() => NfcReader.stop(), 1500);
    if (e.outcome !== "PENDING") {
      stopSoon();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      recordTap(e);
      setPhase({ kind: "done", tone: "bad", message: READER_ERRORS[e.errorDetail ?? ""] ?? `Tap failed: ${e.errorDetail ?? e.outcome}. Hold the phones together a little longer.` });
      return;
    }
    setPhase({ kind: "submitting" });
    const tapId = e.tapId!;
    let outcome: TapOutcome = "OK";
    try {
      const r = await submit(e, false);
      NfcReader.resolveEnrollment(tapId, ConfirmResult.ENROLLED, `Enrolled: ${labelRef.current}`);
      succeeded(r);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "NETWORK";
      outcome = code === "ALREADY_ENROLLED" ? "DUPLICATE" : code === "BAD_SIGNATURE" ? "BAD_SIGNATURE" : code === "UNKNOWN_DEVICE" ? "UNKNOWN_DEVICE" : "PROTOCOL_ERROR";
      const studentText: Record<string, [number, string]> = {
        ALREADY_ENROLLED: [ConfirmResult.ALREADY_MARKED, `Already enrolled: ${labelRef.current}`],
        BAD_SIGNATURE: [ConfirmResult.BAD_SIGNATURE, "Verification failed"],
        UNKNOWN_DEVICE: [ConfirmResult.UNKNOWN_DEVICE, "Open the app with internet first"],
      };
      const [result, text] = studentText[code] ?? [ConfirmResult.NOT_ENROLLED, "Not enrolled. See lecturer."];
      NfcReader.resolveEnrollment(tapId, result, text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      if (code === "STUDENT_HAS_OTHER_DEVICE") {
        setPhase({ kind: "done", tone: "warn", message: "This student already has another phone linked." });
        Alert.alert(
          "Replace the student's phone?",
          "Their old phone will stop working for check-in. Do this only if they lost it or changed phones.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Replace",
              style: "destructive",
              onPress: async () => {
                try {
                  succeeded(await submit(e, true));
                } catch (e2) {
                  setPhase({ kind: "done", tone: "bad", message: errorMessage(e2) });
                }
              },
            },
          ],
        );
      } else {
        setPhase({ kind: "done", tone: "bad", message: errorMessage(err) });
      }
    } finally {
      stopSoon();
      recordTap({ ...e, outcome: "OK" }, outcome);
    }
  }

  const start = async () => {
    setPhase({ kind: "waiting" });
    await NfcReader.startEnrollment(classId, label);
  };

  const status = NfcReader.getStatus();
  const ready = fullName.trim().length > 0 && indexNumber.trim().length >= 3;

  return (
    <Screen>
      {!status.nfcSupported ? <Banner tone="bad">This phone has no NFC reader.</Banner> : null}
      {status.nfcSupported && !status.nfcEnabled ? (
        <Card>
          <Banner tone="warn">NFC is off.</Banner>
          <Button title="Open NFC settings" variant="secondary" onPress={() => NfcReader.openNfcSettings()} />
        </Card>
      ) : null}

      <Field label="Student's full name" value={fullName} onChangeText={setFullName} />
      <Field label="Index number" value={indexNumber} onChangeText={setIndexNumber} autoCapitalize="characters" />

      {phase.kind === "waiting" || phase.kind === "submitting" ? (
        <Card style={{ alignItems: "center", paddingVertical: 32 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: c.primary, marginBottom: 12 }} />
          <H2>{phase.kind === "waiting" ? "Tap the student's phone" : "Checking with the server…"}</H2>
          <Body muted>
            {phase.kind === "waiting"
              ? "Student: unlock your phone and hold its back against the back of this phone until it vibrates."
              : "Keep the phones together for a moment."}
          </Body>
        </Card>
      ) : (
        <Button title="Ready: tap student's phone" onPress={start} disabled={!ready || !status.nfcEnabled} />
      )}

      {phase.kind === "done" ? <Banner tone={phase.tone}>{phase.message}</Banner> : null}
      {phase.kind === "done" ? <Body muted>Enter the next student and tap again, or go back when finished.</Body> : null}
    </Screen>
  );
}
