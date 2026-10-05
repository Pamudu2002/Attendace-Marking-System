import { createContext, useContext } from "react";
import type { IdentityState } from "./identity";
import type { PushSetupResult } from "./push";

export interface AppState {
  identity: IdentityState;
  push: PushSetupResult | null;
  reload: () => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useAppState(): AppState {
  const v = useContext(AppContext);
  if (!v) throw new Error("AppContext missing");
  return v;
}
