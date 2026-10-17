import { defineConfig } from '@playwright/test';

/**
 * Store screenshots, produced by driving the real extension. Separate from the
 * end-to-end config because these are not tests — they write the listing's
 * images, and a CI run should neither produce nor depend on them.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/screenshots.spec.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
});
