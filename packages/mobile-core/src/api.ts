import * as SecureStore from "expo-secure-store";
import type { TokenPair } from "@attendance/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface TokenStore {
  get(): Promise<TokenPair | null>;
  set(tokens: TokenPair | null): Promise<void>;
}

/** Tokens in the Android Keystore-encrypted SecureStore. */
export function secureTokenStore(key: string): TokenStore {
  let cache: TokenPair | null | undefined;
  return {
    async get() {
      if (cache !== undefined) return cache;
      const raw = await SecureStore.getItemAsync(key);
      cache = raw ? (JSON.parse(raw) as TokenPair) : null;
      return cache;
    },
    async set(tokens) {
      cache = tokens;
      if (tokens) await SecureStore.setItemAsync(key, JSON.stringify(tokens));
      else await SecureStore.deleteItemAsync(key);
    },
  };
}

export interface ApiClientOptions {
  baseUrl: () => Promise<string> | string;
  tokens: TokenStore;
  /** Student app: obtain fresh tokens without user interaction (Keystore challenge–response). */
  reauthenticate?: () => Promise<TokenPair | null>;
  /** Called when the session cannot be recovered (teacher must log in again). */
  onSignedOut?: () => void;
}

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: boolean;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(opts: ApiClientOptions) {
  let refreshing: Promise<TokenPair | null> | null = null;

  async function url(path: string, query?: RequestOptions["query"]) {
    const base = (await opts.baseUrl()).replace(/\/+$/, "");
    const qs = Object.entries(query ?? {})
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    return `${base}/api/v1${path}${qs ? `?${qs}` : ""}`;
  }

  async function send(method: string, path: string, o: RequestOptions, accessToken?: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? 15_000);
    try {
      return await fetch(await url(path, o.query), {
        method,
        headers: {
          accept: "application/json",
          ...(o.body !== undefined ? { "content-type": "application/json" } : {}),
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          ...o.headers,
        },
        body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      throw new ApiError(0, "NETWORK", "Cannot reach the server. Check your connection and server URL.", e);
    } finally {
      clearTimeout(timer);
    }
  }

  async function doRefresh(): Promise<TokenPair | null> {
    const current = await opts.tokens.get();
    if (current) {
      let res: Response;
      try {
        res = await send("POST", "/auth/refresh", { body: { refreshToken: current.refreshToken } });
      } catch {
        return null; // offline: keep the tokens and try again later
      }
      if (res.ok) {
        const tokens = (await res.json()) as TokenPair;
        await opts.tokens.set(tokens);
        return tokens;
      }
      if (res.status !== 401) return null; // transient server error: keep tokens
    }
    if (opts.reauthenticate) {
      const tokens = await opts.reauthenticate().catch(() => null);
      if (tokens) {
        await opts.tokens.set(tokens);
        return tokens;
      }
    }
    await opts.tokens.set(null);
    opts.onSignedOut?.();
    return null;
  }

  /** Single-flight refresh so parallel 401s rotate the refresh token only once. */
  function refresh() {
    refreshing ??= doRefresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function raw(method: string, path: string, o: RequestOptions = {}): Promise<Response> {
    const auth = o.auth ?? true;
    let tokens = auth ? await opts.tokens.get() : null;
    if (auth && !tokens) tokens = await refresh();
    let res = await send(method, path, o, tokens?.accessToken);
    if (auth && res.status === 401) {
      const fresh = await refresh();
      if (fresh) res = await send(method, path, o, fresh.accessToken);
    }
    return res;
  }

  async function request<T>(method: string, path: string, o: RequestOptions = {}): Promise<T> {
    const res = await raw(method, path, o);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const err = (data as { error?: { code: string; message: string; details?: unknown } } | undefined)?.error;
      throw new ApiError(res.status, err?.code ?? "HTTP_" + res.status, err?.message ?? `Request failed (${res.status})`, err?.details);
    }
    return data as T;
  }

  return {
    raw,
    request,
    get: <T>(path: string, o?: RequestOptions) => request<T>("GET", path, o),
    post: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>("POST", path, { ...o, body: body ?? {} }),
    put: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>("PUT", path, { ...o, body: body ?? {} }),
    patch: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>("PATCH", path, { ...o, body: body ?? {} }),
    del: <T>(path: string, o?: RequestOptions) => request<T>("DELETE", path, o),
    url,
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: { code: "BAD_RESPONSE", message: text.slice(0, 200) } };
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
