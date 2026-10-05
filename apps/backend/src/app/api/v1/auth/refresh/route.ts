import { RefreshBody } from "@attendance/shared";
import { rotateRefreshToken } from "@/lib/auth";
import { clientIp, handler, json, parseBody } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  rateLimit(`refresh:${clientIp(req)}`, 120, 15 * 60_000);
  const { refreshToken } = await parseBody(req, RefreshBody);
  return json(await rotateRefreshToken(refreshToken));
});
