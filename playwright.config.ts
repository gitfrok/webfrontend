// Playwright covers the browse → file → diff journey (SPEC-0021 AC6) against a
// stub BFF, which is what makes it an honest end-to-end for THIS repo: the
// webfrontend's contract is that every view renders from the BFF and the app
// reaches nothing else (invariant 22, SPEC-0021 AC4). A stub is enough to prove
// that, and it keeps the run hermetic — no cluster, no database, no scanners.
//
// The SSR server is the real production build served by the node adapter, not
// the dev server: what the E2E exercises should be what ships.
import { defineConfig } from '@playwright/test';

const stubPort = 4321;
const appPort = 4322;

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  // One retry absorbs a cold-start flake on the SSR server without hiding a
  // genuinely broken journey, which would fail both times.
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${appPort}`,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: `node e2e/stub-bff.mjs`,
      port: stubPort,
      env: { STUB_BFF_PORT: String(stubPort) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run build && node ./dist/server/entry.mjs`,
      port: appPort,
      env: {
        GITFROK_BFF_ORIGIN: `http://localhost:${stubPort}`,
        HOST: 'localhost',
        PORT: String(appPort),
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
