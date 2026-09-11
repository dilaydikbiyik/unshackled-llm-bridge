import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Separate from vite.config.ts so tests run without the CRXJS plugin.
export default defineConfig({
  resolve: {
    alias: {
      '@domain': fileURLToPath(new URL('./src/domain', import.meta.url)),
      '@data': fileURLToPath(new URL('./src/data', import.meta.url)),
      '@views': fileURLToPath(new URL('./src/views', import.meta.url)),
      '@controllers': fileURLToPath(new URL('./src/controllers', import.meta.url)),
      '@adapters': fileURLToPath(new URL('./src/adapters', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The threshold covers the logic unit tests can genuinely reach, so the
      // number stays honest instead of decorative. Everything excluded below
      // is excluded for a stated reason, not because it was inconvenient:
      exclude: [
        'src/**/*.test.ts',
        // Type-only modules: no executable statements to cover.
        'src/domain/transfer.ts',
        'src/shared/health.ts',
        // Entry points that only wire the real browser into tested modules.
        // They are exercised end to end by the Playwright suite in e2e/.
        'src/controllers/background/index.ts',
        'src/controllers/content/index.ts',
        'src/views/sidepanel/main.ts',
      ],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
