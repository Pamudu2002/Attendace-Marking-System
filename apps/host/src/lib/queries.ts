import { useQuery } from "@tanstack/react-query";
import type {
  AnalyticsSummaryDto,
  ArrivalsDto,
  ClassDto,
  MatrixDto,
  PatternsDto,
  RosterStudentDto,
  SessionAttendanceDto,
  SessionDto,
  SessionTrendDto,
  StudentAnalyticsRowDto,
  StudentDetailDto,
} from "@attendance/shared";
import { api } from "./api";

export type SessionDetail = SessionDto & {
  presentCount: number;
  enrolledCount: number;
  class: { id: string; name: string; code: string | null; lateAfterMin: number; checkInOpensBeforeMin: number };
};

export const qk = {
  classes: ["classes"] as const,
  class: (id: string) => ["class", id] as const,
  sessions: (classId: string) => ["class", classId, "sessions"] as const,
  roster: (classId: string) => ["class", classId, "roster"] as const,
  analytics: (classId: string, part: string) => ["class", classId, "analytics", part] as const,
  session: (id: string) => ["session", id] as const,
  attendance: (id: string) => ["session", id, "attendance"] as const,
};

export const useClasses = (archived = false) =>
  useQuery({
    queryKey: [...qk.classes, archived],
    queryFn: async () => (await api.get<{ items: ClassDto[] }>("/classes", { query: { archived } })).items,
  });

export const useClass = (id: string) => useQuery({ queryKey: qk.class(id), queryFn: () => api.get<ClassDto>(`/classes/${id}`) });

export const useSessions = (classId: string) =>
  useQuery({
    queryKey: qk.sessions(classId),
    queryFn: async () => (await api.get<{ items: SessionDto[] }>(`/classes/${classId}/sessions`)).items,
  });

export const useRoster = (classId: string) =>
  useQuery({
    queryKey: qk.roster(classId),
    queryFn: async () => (await api.get<{ items: RosterStudentDto[] }>(`/classes/${classId}/students`)).items,
  });

export const useSession = (id: string) =>
  useQuery({ queryKey: qk.session(id), queryFn: () => api.get<SessionDetail>(`/sessions/${id}`) });

export const useSessionAttendance = (id: string) =>
  useQuery({ queryKey: qk.attendance(id), queryFn: () => api.get<SessionAttendanceDto>(`/sessions/${id}/attendance`) });

function analytics<T>(classId: string, part: string, query?: Record<string, string>) {
  return {
    queryKey: [...qk.analytics(classId, part), query ?? {}],
    queryFn: () => api.get<T>(`/classes/${classId}/analytics/${part}`, { query }),
  };
}

export const useSummary = (classId: string) => useQuery(analytics<AnalyticsSummaryDto>(classId, "summary"));
export const useStudentRows = (classId: string) =>
  useQuery({
    ...analytics<{ items: StudentAnalyticsRowDto[] }>(classId, "students"),
    select: (d: { items: StudentAnalyticsRowDto[] }) => d.items,
  });
export const useTrend = (classId: string) => useQuery(analytics<SessionTrendDto>(classId, "sessions"));
export const useMatrix = (classId: string) => useQuery(analytics<MatrixDto>(classId, "matrix"));
export const useArrivals = (classId: string) => useQuery(analytics<ArrivalsDto>(classId, "arrivals"));
export const usePatterns = (classId: string) =>
  useQuery(analytics<PatternsDto>(classId, "patterns", { tz: Intl.DateTimeFormat().resolvedOptions().timeZone }));
export const useStudentDetail = (classId: string, studentId: string) =>
  useQuery({
    queryKey: [...qk.analytics(classId, "student"), studentId],
    queryFn: () => api.get<StudentDetailDto>(`/classes/${classId}/analytics/students/${studentId}`),
  });
