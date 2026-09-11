import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test as base, chromium, type BrowserContext } from '@playwright/test';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const SELECTORS = readFileSync(new URL('../config/selectors.json', import.meta.url), 'utf8');

/**
 * Which fixture page answers a given platform URL. Conversation URLs and
 * new-chat URLs get different pages, as on the real sites — the health check
 * treats them differently, and the suite should see what a user would.
 */
function pageFor(url: URL): string | null {
  switch (url.host) {
    case 'chatgpt.com':
      return 'chatgpt-conversation.html';
    case 'claude.ai':
      return url.pathname.startsWith('/chat/') ? 'claude-conversation.html' : 'claude-new.html';
    case 'gemini.google.com':
      return 'gemini-new.html';
    default:
      return null;
  }
}

async function routePlatforms(context: BrowserContext): Promise<void> {
  // The live selector config comes from the repository; serve the local copy
  // so a run never depends on the network or on what is pushed.
  await context.route('https://raw.githubusercontent.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: SELECTORS }),
  );
  for (const host of ['chatgpt.com', 'claude.ai', 'gemini.google.com']) {
    await context.route(`https://${host}/**`, (route) => {
      const url = new URL(route.request().url());
      const page = route.request().resourceType() === 'document' ? pageFor(url) : null;
      return page
        ? route.fulfill({ status: 200, contentType: 'text/html', body: fixture(page) })
        : route.fulfill({ status: 204, body: '' });
    });
  }
}

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      // The full Chromium build: the headless shell cannot load extensions.
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        // Resolve no real host. Routed requests never reach DNS, so fixtures
        // still load; anything that escapes routing fails instead of reaching
        // the real sites — see arrive() in fork.spec.ts for why that matters.
        '--host-resolver-rules=MAP * ~NOTFOUND',
      ],
    });
    await routePlatforms(context);
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(new URL(worker.url()).host);
  },
});

export { expect } from '@playwright/test';
