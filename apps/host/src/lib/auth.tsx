import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { TeacherDto, TokenPair } from "@attendance/shared";
import { api, onSignedOut, tokens } from "./api";

interface AuthState {
  teacher: TeacherDto | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(fullName: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [teacher, setTeacher] = useState<TeacherDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (await tokens.get()) setTeacher(await api.get<TeacherDto>("/auth/teacher/me"));
      } catch {
        // Offline at startup: stay signed in if we still have tokens, check-in works offline.
        const t = await tokens.get();
        if (t) setTeacher({ id: "offline", email: "", fullName: "Offline" });
      } finally {
        setLoading(false);
      }
    })();
    const off = onSignedOut(() => setTeacher(null));
    return () => {
      off();
    };
  }, []);

  const finish = useCallback(async (r: { teacher: TeacherDto } & TokenPair) => {
    await tokens.set({ accessToken: r.accessToken, refreshToken: r.refreshToken });
    setTeacher(r.teacher);
  }, []);

  const value: AuthState = {
    teacher,
    loading,
    login: async (email, password) =>
      finish(await api.post("/auth/teacher/login", { email, password }, { auth: false })),
    register: async (fullName, email, password) =>
      finish(await api.post("/auth/teacher/register", { fullName, email, password }, { auth: false })),
    logout: async () => {
      const t = await tokens.get();
      if (t) await api.post("/auth/logout", { refreshToken: t.refreshToken }).catch(() => undefined);
      await tokens.set(null);
      setTeacher(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(AuthContext);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}
