import { createApiClient, secureTokenStore } from "@attendance/mobile-core";
import { getApiUrl } from "./config";

export const tokens = secureTokenStore("teacher_tokens");

type Listener = () => void;
const signedOutListeners = new Set<Listener>();
export const onSignedOut = (fn: Listener) => {
  signedOutListeners.add(fn);
  return () => signedOutListeners.delete(fn);
};

export const api = createApiClient({
  baseUrl: getApiUrl,
  tokens,
  onSignedOut: () => signedOutListeners.forEach((fn) => fn()),
});
