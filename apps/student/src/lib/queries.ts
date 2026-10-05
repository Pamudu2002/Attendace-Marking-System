import { useQuery } from "@tanstack/react-query";
import type { SessionDto, StudentClassDetailDto, StudentClassDto, StudentMeDto } from "@attendance/shared";
import { api } from "./api";

export type StudentSession = SessionDto & { myStatus: "PRESENT" | "LATE" | "EXCUSED" | null };

export const qk = {
  me: ["me"] as const,
  classes: ["classes"] as const,
  classDetail: (id: string) => ["class", id] as const,
  sessions: ["sessions"] as const,
};

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => api.get<StudentMeDto>("/student/me") });

export const useClasses = () =>
  useQuery({ queryKey: qk.classes, queryFn: async () => (await api.get<{ items: StudentClassDto[] }>("/student/classes")).items });

export const useClassDetail = (classId: string) =>
  useQuery({
    queryKey: qk.classDetail(classId),
    queryFn: () => api.get<StudentClassDetailDto>(`/student/classes/${classId}`),
  });

export const useUpcomingSessions = () =>
  useQuery({
    queryKey: qk.sessions,
    queryFn: async () => (await api.get<{ items: StudentSession[] }>("/student/sessions")).items,
    refetchInterval: 60_000,
  });
