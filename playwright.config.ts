import { defineConfig } from '@playwright/test';

/**
 * End-to-end: the built extension, loaded into real Chromium, driven through
 * a full fork. Platform domains are routed to local fixture pages (e2e/fixtures),
 * so the suite needs no login and no network, and runs the same in CI.
 * `npm run e2e` builds dist/ first.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { trace: 'retain-on-failure' },
});
