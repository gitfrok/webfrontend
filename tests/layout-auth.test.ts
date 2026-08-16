// Auth surface on the shared SSR shell (board #34). The shell shows exactly
// one affordance: a Sign in link to same-origin /login when no session cookie
// is present, and a signed-in indicator with a Sign out form POSTing to
// same-origin /logout when one is. The switch keys off cookie PRESENCE only —
// the BFF remains the sole session authority (ADR-0049), so a stale cookie
// can render the signed-in affordance but can never authorize anything.
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Layout from '../src/layouts/Layout.astro';
import { hasSessionCookie, sessionCookieName } from '../src/lib/session';

async function render(cookie?: string): Promise<string> {
  const container = await AstroContainer.create();
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  const request = new Request('http://app.gitsaas.test/', { headers });
  return container.renderToString(Layout, { props: { title: 'gitfrok' }, request });
}

describe('session cookie presence detection', () => {
  it('detects the __Host- session cookie among other cookies', () => {
    const request = new Request('http://app.gitsaas.test/', {
      headers: { cookie: `other=x; ${sessionCookieName}=abc; third=y` },
    });
    expect(hasSessionCookie(request)).toBe(true);
  });

  it('reports no session for an absent cookie, an empty value, or no header', () => {
    expect(hasSessionCookie(new Request('http://app.gitsaas.test/'))).toBe(false);
    expect(hasSessionCookie(new Request('http://app.gitsaas.test/', {
      headers: { cookie: `${sessionCookieName}=` },
    }))).toBe(false);
    expect(hasSessionCookie(new Request('http://app.gitsaas.test/', {
      headers: { cookie: 'unrelated=abc' },
    }))).toBe(false);
  });
});

describe('shell auth surface', () => {
  it('renders the sign-in link pointing at same-origin /login when no session exists', async () => {
    const html = await render();
    expect(html).toContain('data-auth="sign-in"');
    expect(html).toContain('href="/login"');
    expect(html).toContain('Sign in');
    // No signed-in affordance leaks into the anonymous shell.
    expect(html).not.toContain('data-auth="signed-in"');
    expect(html).not.toContain('/logout');
  });

  it('renders the signed-in indicator and a Sign out form POSTing to /logout when a session exists', async () => {
    const html = await render(`${sessionCookieName}=abc`);
    expect(html).toContain('data-auth="signed-in"');
    expect(html).toContain('Signed in');
    expect(html).toContain('action="/logout"');
    expect(html).toContain('method="post"');
    expect(html).toContain('Sign out');
    // The anonymous affordance is gone — the shell shows exactly one.
    expect(html).not.toContain('data-auth="sign-in"');
    expect(html).not.toContain('href="/login"');
  });

  it('always carries the nav link to /usage', async () => {
    expect(await render()).toContain('href="/usage"');
    expect(await render(`${sessionCookieName}=abc`)).toContain('href="/usage"');
  });
});
