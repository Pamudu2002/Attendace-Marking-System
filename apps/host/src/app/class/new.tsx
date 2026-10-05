import { useState } from "react";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ClassDto } from "@attendance/shared";
import { Banner, Body, Button, errorMessage, Field, Screen } from "@attendance/mobile-core";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";

export default function NewClassScreen() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [threshold, setThreshold] = useState("80");
  const [lateAfter, setLateAfter] = useState("15");
  const [opensBefore, setOpensBefore] = useState("15");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const cls = await api.post<ClassDto>("/classes", {
        name: name.trim(),
        code: code.trim() || undefined,
        thresholdPct: Number(threshold) || 80,
        lateAfterMin: Number(lateAfter) || 0,
        checkInOpensBeforeMin: Number(opensBefore) || 0,
      });
      await qc.invalidateQueries({ queryKey: qk.classes });
      router.replace(`/class/${cls.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Field label="Class name" value={name} onChangeText={setName} placeholder="Mobile Computing" />
      <Field label="Course code (optional)" value={code} onChangeText={setCode} placeholder="CS4473" autoCapitalize="characters" />
      <Field label="Attendance requirement (%)" value={threshold} onChangeText={setThreshold} keyboardType="number-pad" />
      <Field label="Late after (minutes from start)" value={lateAfter} onChangeText={setLateAfter} keyboardType="number-pad" />
      <Field label="Check-in opens (minutes before start)" value={opensBefore} onChangeText={setOpensBefore} keyboardType="number-pad" />
      <Body muted>Students tapping after the late limit are marked LATE; taps outside the session window are refused.</Body>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Button title="Create class" onPress={save} loading={busy} disabled={!name.trim()} />
    </Screen>
  );
}
