import { RefreshBody } from "@attendance/shared";
import { authenticate, revokeRefreshToken } from "@/lib/auth";
import { handler, noContent, parseBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const claims = await authenticate(req);
  const { refreshToken } = await parseBody(req, RefreshBody);
  await revokeRefreshToken(refreshToken, claims.sub);
  return noContent();
});
