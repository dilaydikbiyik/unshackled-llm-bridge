import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BrowserContext } from '@playwright/test';
import { expect, test } from './extension';

/**
 * The Chrome Web Store's screenshots, produced by driving the real extension
 * rather than staged by hand.
 *
 * A listing is the first thing a reviewer and a user see, and hand-made
 * screenshots go stale the moment the UI moves — these are regenerated with
 * `npm run screenshots` and cannot show a dialog the build does not have.
 *
 * The store wants 1280×800.
 */
const STORE = { width: 1280, height: 800 };
const OUT = fileURLToPath(new URL('../store-assets', import.meta.url));

test.use({ viewport: STORE });

/** The listing is in English, so the UI in its images has to be. */
const LANGUAGE = process.env['ULB_LANG'] ?? 'en';

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

/**
 * Sets the extension's language through its own settings store, from the
 * service worker, so the screenshots show the UI a store visitor will meet
 * rather than whatever the default happens to be.
 */
async function useLanguage(context: Parameters<typeof test>[0] extends never ? never : BrowserContext) {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate(async (language) => {
    const stored = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({
      settings: { ...(stored['settings'] ?? {}), language, onboardingDone: true },
    });
  }, LANGUAGE);
}

test('screenshot: forking a conversation', async ({ context }) => {
  await useLanguage(context);
  const page = await context.newPage();
  await page.setViewportSize(STORE);
  await page.goto('https://chatgpt.com/c/shot-1');

  await page.locator('section[data-testid="conversation-turn-2"]').hover();
  await page.locator('#ulb-fork-button-host #fork').click();

  const dialog = page.locator('#ulb-fork-dialog-host');
  await expect(dialog.locator('#preview')).not.toHaveValue('');
  await page.screenshot({ path: `${OUT}/1-fork-dialog.png` });
});

test('screenshot: the package landing in the target', async ({ context }) => {
  await useLanguage(context);
  const source = await context.newPage();
  await source.setViewportSize(STORE);
  await source.goto('https://chatgpt.com/c/shot-2');
  await source.locator('section[data-testid="conversation-turn-2"]').hover();
  await source.locator('#ulb-fork-button-host #fork').click();

  const dialog = source.locator('#ulb-fork-dialog-host');
  await dialog.locator('#delivery').selectOption('inline');
  await expect(dialog.locator('#preview')).toHaveValue(/conversation/);

  const [target] = await Promise.all([
    context.waitForEvent('page'),
    dialog.locator('#transfer').click(),
  ]);
  await target.setViewportSize(STORE);
  await target.goto('https://claude.ai/new');
  await expect(target.locator('div.ProseMirror[contenteditable="true"]')).toContainText('Kyoto');
  // Proof in the picture: the composer is full and nothing was sent.
  expect(await target.evaluate(() => (window as { __sendClicks?: number }).__sendClicks ?? 0)).toBe(0);
  await target.screenshot({ path: `${OUT}/2-landed-in-target.png` });
});

test('screenshot: the side panel', async ({ context, extensionId }) => {
  await useLanguage(context);
  const panel = await context.newPage();
  await panel.setViewportSize(STORE);
  await panel.goto(`chrome-extension://${extensionId}/src/views/sidepanel/index.html`);
  await expect(panel.locator('h1')).toBeVisible();

  // Chrome's side panel is a narrow column; shown across 1280px it misleads
  // about its own layout. The panel is the real one — only the page around it
  // is given the width a browser would.
  await panel.addStyleTag({
    content: `
      body { background: #e9e6df; }
      #app {
        width: 400px; margin: 0 auto; min-height: 100vh; background: #fff;
        box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 18px 50px rgba(0,0,0,.12);
        padding-left: 16px; padding-right: 16px;
      }
    `,
  });
  await panel.screenshot({ path: `${OUT}/3-side-panel.png` });
});
