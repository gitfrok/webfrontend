// Session presence for the SSR shell (T-0034 auth surface).
//
// The BFF is the only session authority (ADR-0049): it issues the
// __Host-gitfrok_session cookie after the OIDC/PKCE login and it alone
// validates sessions. This helper does NOT validate, parse, or decode the
// cookie — it checks for the presence of a non-empty value so the shell can
// choose which affordance to show (Sign in vs. Sign out). A stale or forged
// cookie changes nothing downstream: every BFF call still resolves identity
// server-side, and /usage renders its own session messaging on refusal.
export const sessionCookieName = '__Host-gitfrok_session';

// hasSessionCookie reports whether the incoming request carries a non-empty
// session cookie. Presence only — the value is never read.
export function hasSessionCookie(request: Request): boolean {
  const header = request.headers.get('cookie');
  if (!header) return false;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === sessionCookieName) {
      return part.slice(eq + 1).trim() !== '';
    }
  }
  return false;
}
