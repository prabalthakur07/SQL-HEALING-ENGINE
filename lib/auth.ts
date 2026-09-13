import { NextRequest } from 'next/server';

/**
 * Minimal API-key gate. Good enough for an internal tool or a portfolio
 * demo behind a shared secret; NOT sufficient for a multi-tenant product.
 *
 * For real multi-user usage, replace this with proper session auth
 * (NextAuth, Clerk, etc.) and scope database credentials per-tenant -
 * a shared API key cannot express "this user may only query these tables."
 */
export function isAuthorized(req: NextRequest): boolean {
  const configuredKey = process.env.APP_API_KEY;
  if (!configuredKey) {
    // No key configured -> auth is intentionally open (local dev default).
    // Set APP_API_KEY before deploying anywhere reachable from the internet.
    return true;
  }
  const provided = req.headers.get('x-api-key');
  return provided === configuredKey;
}
