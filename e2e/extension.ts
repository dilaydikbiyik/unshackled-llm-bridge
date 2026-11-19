import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
      // A plain chatgpt.com/ load is the new-chat page; the panel suite opens
      // it as a comparison target.
      if (url.pathname === '/') return 'chatgpt-new.html';
      // A user who keeps asking for shorter answers, for the learned-preference test.
      if (url.pathname.startsWith('/c/pref-')) return 'chatgpt-preference.html';
      if (url.pathname.startsWith('/c/actions-')) return 'chatgpt-actions.html';
      // The store screenshots use a neutral page with the same structure: a
      // listing should not show another company's interface, and a picture of
      // a bare test fixture tells a user nothing.
      return process.env['ULB_SHOWCASE'] ? 'showcase.html' : 'chatgpt-conversation.html';
    case 'claude.ai':
      if (url.pathname === '/silent') return 'claude-silent.html';
      if (url.pathname.startsWith('/chat/actions-')) return 'claude-actions.html';
      return url.pathname.startsWith('/chat/') ? 'claude-conversation.html' : 'claude-new.html';
    case 'gemini.google.com':
      return url.pathname.startsWith('/app/actions-') ? 'gemini-actions.html' : 'gemini-new.html';
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
  await context.route(`https://${CUSTOM_SITE}/**`, (route) =>
    route.request().resourceType() === 'document'
      ? route.fulfill({ status: 200, contentType: 'text/html', body: fixture('generic-chat.html') })
      : route.fulfill({ status: 204, body: '' }),
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

/**
 * A site the user has added, standing in for Perplexity, a local model, any of
 * them. It is not one of the three the extension ships knowing.
 */
export const CUSTOM_SITE = 'custom-chat.example';

/**
 * The built extension, copied, with the custom site's host permission already
 * granted.
 *
 * Adding a site ends in Chrome's own permission prompt, which no automated
 * browser can accept. A granted optional permission behaves exactly like a
 * declared one, so declaring it in a throwaway copy lets the suite drive the
 * rest of the real path — the panel, the dynamic registration, the content
 * script on a site it was never built for — without ever touching dist/.
 */
function extensionUnderTest(): string {
  const copy = mkdtempSync(join(tmpdir(), 'ulb-e2e-'));
  cpSync(DIST, copy, { recursive: true });
  const manifestPath = join(copy, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { host_permissions: string[] };
  manifest.host_permissions.push(`https://${CUSTOM_SITE}/*`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return copy;
}

const EXTENSION = extensionUnderTest();

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      // The full Chromium build: the headless shell cannot load extensions.
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXTENSION}`,
        `--load-extension=${EXTENSION}`,
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
