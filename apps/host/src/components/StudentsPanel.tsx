import { Alert } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { RosterStudentDto } from "@attendance/shared";
import { Badge, Body, Button, Card, Empty, fmtPct, Row } from "@attendance/mobile-core";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";

export function StudentsPanel({ classId, roster, threshold }: { classId: string; roster: RosterStudentDto[]; threshold: number }) {
  const qc = useQueryClient();
  const remove = (s: RosterStudentDto) =>
    Alert.alert(`Remove ${s.fullName}?`, "Their past attendance is kept, but they stop counting for this class.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await api.del(`/classes/${classId}/enrollments/${s.studentId}`);
          qc.invalidateQueries({ queryKey: qk.class(classId) });
        },
      },
    ]);

  return (
    <>
      <Button title="+ Add student by tap" onPress={() => router.push(`/class/${classId}/enroll`)} />
      {roster.length === 0 ? <Empty title="No students yet" hint="Type a student's name and index number, then tap their phone." /> : null}
      {roster.map((s) => {
        const tone = s.attendancePct === null ? "neutral" : s.attendancePct >= threshold ? "good" : "bad";
        return (
          <Card key={s.studentId} onPress={() => router.push(`/class/${classId}/student/${s.studentId}`)}>
            <Row style={{ justifyContent: "space-between" }}>
              <Body style={{ fontWeight: "600", flex: 1 }}>{s.fullName}</Body>
              <Badge label={`${tone === "bad" ? "▼ " : ""}${fmtPct(s.attendancePct)}`} tone={tone} />
            </Row>
            <Body muted>
              {s.indexNumber} · {s.device ? (s.device.model ?? "phone linked") : "no phone linked"}
            </Body>
            <Button title="Remove from class" variant="secondary" onPress={() => remove(s)} />
          </Card>
        );
      })}
    </>
  );
}
