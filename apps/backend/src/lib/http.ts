import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";

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

export const notFound = (what = "Resource") => new ApiError(404, "NOT_FOUND", `${what} not found`);
export const forbidden = () => new ApiError(403, "FORBIDDEN", "You do not have access to this resource");

export function json<T>(data: T, status = 200, headers?: HeadersInit) {
  return NextResponse.json(data, { status, headers });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  }
  if (err instanceof ZodError) {
    return json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request", details: z.flattenError(err) } },
      400,
    );
  }
  console.error(err);
  return json({ error: { code: "INTERNAL", message: "Internal server error" } }, 500);
}

type Params = Record<string, string>;
export type RouteCtx<P extends Params = Params> = { params: Promise<P> };

/** Wraps a route handler with uniform error handling. */
export function handler<P extends Params = Params>(
  fn: (req: NextRequest, params: P) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: RouteCtx<P>) => {
    try {
      return await fn(req, (await ctx?.params) ?? ({} as P));
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseBody<S extends ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Body must be valid JSON");
  }
  return schema.parse(raw);
}

export function parseQuery<S extends ZodType>(req: NextRequest, schema: S): z.output<S> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}

export function parseUuid(value: string, what = "id"): string {
  const r = z.uuid().safeParse(value);
  if (!r.success) throw notFound(what);
  return r.data;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
