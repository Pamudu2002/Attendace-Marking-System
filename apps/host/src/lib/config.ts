import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const KEY = "api_url_override";
let cached: string | null = null;

export async function getApiUrl(): Promise<string> {
  if (cached) return cached;
  cached = (await SecureStore.getItemAsync(KEY)) || (Constants.expoConfig?.extra?.apiUrl as string) || "https://attendance-backend-steel.vercel.app";
  return cached;
}

export async function setApiUrl(url: string | null) {
  cached = null;
  if (url) await SecureStore.setItemAsync(KEY, url.trim().replace(/\/+$/, ""));
  else await SecureStore.deleteItemAsync(KEY);
}
