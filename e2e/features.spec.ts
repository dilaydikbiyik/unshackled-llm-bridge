import type { BrowserContext } from '@playwright/test';
import { expect, forkFrom, test } from './extension';

/**
 * The features the other suites reach only in parts: summarizing through the
 * Anthropic API, the keyboard shortcut, dragging a conversation out, the
 * trimmed mode, and the relay that sends only what the other side missed.
 */

async function worker(context: BrowserContext) {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

/** Writes settings through the extension's own store, as the side panel does. */
async function setSettings(context: BrowserContext, patch: Record<string, unknown>): Promise<void> {
  await (await worker(context)).evaluate(async (values) => {
    const stored = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(stored['settings'] ?? {}), ...values } });
  }, patch);
}

test('summary mode: the brief comes from the Anthropic API with the user’s own key', async ({ context }) => {
  // A test key and a stand-in for api.anthropic.com: nothing leaves the machine.
  const requests: { model: string; key: string | null }[] = [];
  await context.route('https://api.anthropic.com/**', async (route) => {
    const body = route.request().postDataJSON() as { model: string };
    requests.push({ model: body.model, key: route.request().headers()['x-api-key'] ?? null });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'msg_e2e',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text: 'BRIEF: the user is planning five days in Kyoto in April.' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 12 },
      }),
    });
  });
  await setSettings(context, { anthropicApiKey: 'sk-ant-e2e-test-key' });

  const source = await context.newPage();
  await source.goto('https://chatgpt.com/c/e2e-summary');
  await forkFrom(source.locator('[data-content-search-unit-key$=":assistant"]'));

  const dialog = source.locator('#ulb-fork-dialog-host');
  await dialog.locator('#delivery').selectOption('inline');
  await dialog.locator('#mode').selectOption('summary');
  await expect(dialog.locator('#preview')).toHaveValue(/BRIEF: the user is planning five days in Kyoto/);
  // The brief replaces the transcript; it is not sent alongside it.
  await expect(dialog.locator('#preview')).not.toHaveValue(/const days = 5;/);
  expect(requests).toEqual([{ model: 'claude-haiku-5-5', key: 'sk-ant-e2e-test-key' }]);
});

test('summary mode: a failed request falls back to the full transcript, and says so', async ({ context }) => {
  await context.route('https://api.anthropic.com/**', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
    }),
  );
  await setSettings(context, { anthropicApiKey: 'sk-ant-e2e-wrong-key' });

  const source = await context.newPage();
  await source.goto('https://chatgpt.com/c/e2e-summary-fail');
  await forkFrom(source.locator('[data-content-search-unit-key$=":assistant"]'));

  const dialog = source.locator('#ulb-fork-dialog-host');
  await dialog.locator('#delivery').selectOption('inline');
  await dialog.locator('#mode').selectOption('summary');
  await expect(dialog.locator('#notice .err')).toBeVisible();
  await expect(dialog.locator('#preview')).toHaveValue(/cherry blossoms/);
});

test('the keyboard shortcut opens the dialog on the whole conversation', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('https://chatgpt.com/c/e2e-shortcut');
  await expect(page.locator('#ulb-fork-button-host')).toBeAttached();
  // Chrome delivers the command to the service worker, which hands it to the
  // tab in front; Playwright cannot press a browser-level shortcut, so the
  // hand-off is made the way the worker makes it.
  await (await worker(context)).evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://chatgpt.com/c/e2e-shortcut' });
    await chrome.tabs.sendMessage(tab!.id!, { type: 'command/fork' });
  });
  const dialog = page.locator('#ulb-fork-dialog-host');
  await expect(dialog.locator('#scope-whole')).toHaveText(/\(2\)/);
});

test('dragging the handle out carries the conversation as a file and as text', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('https://chatgpt.com/c/e2e-drag');
  await page.locator('[data-content-search-unit-key$=":assistant"]').hover();
  const handle = page.locator('#ulb-fork-button-host #fork');
  // The payload is prepared while the pointer rests on the handle, because a
  // drag cannot wait for it.
  await handle.hover();
  await page.waitForTimeout(800);
  const carried = await handle.evaluate((button) => {
    const transfer = new DataTransfer();
    button.dispatchEvent(new DragEvent('dragstart', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    return { download: transfer.getData('DownloadURL'), text: transfer.getData('text/plain') };
  });
  expect(carried.download).toMatch(/^text\/markdown:chatgpt-conversation\.md:blob:/);
  expect(carried.text).toContain('Plan a trip to Kyoto');
});

test('trimmed mode keeps a long conversation inside the budget and says what it left out', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('https://chatgpt.com/c/e2e-trim');
  // Long enough to be trimmed: forty more exchanges of real text.
  await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const form = main.querySelector('form');
    for (let i = 1; i <= 40; i += 1) {
      for (const role of ['user', 'assistant'] as const) {
        const turn = document.createElement('div');
        turn.setAttribute('data-content-search-unit-key', `fallback-turn-${String(i)}:${role === 'user' ? 0 : 1}:${role}`);
        turn.innerHTML =
          role === 'user'
            ? `<div data-user-message-bubble="true">question ${String(i)}: ${'how does the itinerary change if we stay longer '.repeat(40)}</div>`
            : `<div class="DilResponseRoot-x"><p>answer ${String(i)}: ${'then add a day trip and keep the budget in mind '.repeat(60)}</p></div>`;
        main.insertBefore(turn, form);
      }
    }
  });
  await forkFrom(page.locator('[data-content-search-unit-key$=":assistant"]').last());

  const dialog = page.locator('#ulb-fork-dialog-host');
  await dialog.locator('#delivery').selectOption('inline');
  await expect(dialog.locator('#notice .warn')).toBeVisible();
  await dialog.locator('#mode').selectOption('trimmed');
  const preview = dialog.locator('#preview');
  await expect(preview).toHaveValue(/earlier messages omitted/);
  // The opening and the latest exchange survive the cut.
  await expect(preview).toHaveValue(/Plan a trip to Kyoto/);
  await expect(preview).toHaveValue(/answer 40:/);
  await expect(preview).not.toHaveValue(/answer 3:/);
});

test('relay: after a hand-off, the next one to the same assistant carries only what is new', async ({ context }) => {
  const source = await context.newPage();
  await source.goto('https://chatgpt.com/c/e2e-relay');
  await forkFrom(source.locator('[data-content-search-unit-key$=":assistant"]'));
  const dialog = source.locator('#ulb-fork-dialog-host');
  await expect(dialog.locator('#preview')).not.toHaveValue('');
  const [target] = await Promise.all([context.waitForEvent('page'), dialog.locator('#transfer').click()]);
  await target.close();

  // The conversation moves on.
  await source.evaluate(() => {
    const main = document.querySelector('main')!;
    const form = main.querySelector('form');
    const user = document.createElement('div');
    user.setAttribute('data-content-search-unit-key', 'fallback-turn-1:0:user');
    user.innerHTML = '<div data-user-message-bubble="true">And in May?</div>';
    const reply = document.createElement('div');
    reply.setAttribute('data-content-search-unit-key', 'fallback-turn-1:1:assistant');
    reply.innerHTML = '<div class="DilResponseRoot-x"><p>May is greener and quieter.</p></div>';
    main.insertBefore(user, form);
    main.insertBefore(reply, form);
  });

  await source.bringToFront();
  await forkFrom(source.locator('[data-content-search-unit-key$=":assistant"]').last());
  await expect(dialog.locator('#scope')).toHaveValue('sinceLast');
  await expect(dialog.locator('#scope-since')).toHaveText(/\(2\)/);
  await dialog.locator('#delivery').selectOption('inline');
  await expect(dialog.locator('#preview')).toHaveValue(/May is greener/);
  await expect(dialog.locator('#preview')).not.toHaveValue(/cherry blossoms/);
});
