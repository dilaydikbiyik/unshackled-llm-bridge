import type { Page } from '@playwright/test';
import { expect, test } from './extension';

/**
 * Playwright cannot intercept the first navigation of a tab the extension
 * opens with chrome.tabs.create: it starts before Playwright attaches to the
 * tab. Because the browser resolves no real host, that first load fails on an
 * error page, where no content script runs, so the package stays parked. The
 * test then loads the same URL again, this time through the fixture routes,
 * and the target's content script claims the package exactly as it would on
 * the real site. Without the resolver rule, that first load reached the real
 * claude.ai, where the content script could have claimed and wasted the
 * package.
 */
async function arrive(target: Page, url: string): Promise<void> {
  await target.goto(url);
}

/**
 * The whole extension, as a user meets it: content script, fork UI, service
 * worker hand-off across tabs, and injection into the target's composer.
 */

test('forks a ChatGPT conversation into Claude, filling the composer and sending nothing', async ({ context }) => {
  const source = await context.newPage();
  await source.goto('https://chatgpt.com/c/e2e-1');

  await source.locator('section[data-testid="conversation-turn-2"]').hover();
  await source.locator(`#ulb-fork-button-host #fork`).click();

  const dialog = source.locator('#ulb-fork-dialog-host');
  const preview = dialog.locator('#preview');
  // Default delivery: the composer carries the continuation note, the
  // conversation travels as a file.
  await expect(preview).toHaveValue(/chatgpt-conversation\.md/);
  // The note quotes the open request on purpose — that is what the target has
  // to answer. What it must not carry is the conversation itself.
  await expect(preview).toHaveValue(/Where we left off: Plan a trip to Kyoto/);
  await expect(preview).not.toHaveValue(/cherry blossoms/);
  await expect(preview).not.toHaveValue(/```/);

  // Inline delivery still produces the whole package, in Claude's structure.
  await dialog.locator('#delivery').selectOption('inline');
  await expect(preview).toHaveValue(/<conversation>/);
  await expect(preview).toHaveValue(/Plan a trip to Kyoto/);
  await expect(preview).toHaveValue(/\*\*cherry blossoms\*\*/);
  await expect(preview).not.toHaveValue(/Switch model/);
  await expect(preview).toHaveValue(/```js\nconst days = 5;\n```/);

  await dialog.locator('#delivery').selectOption('attachment');
  await expect(preview).toHaveValue(/chatgpt-conversation\.md/);

  const [target] = await Promise.all([
    context.waitForEvent('page'),
    dialog.locator('#transfer').click(),
  ]);
  await arrive(target, 'https://claude.ai/new');

  const composer = target.locator('div.ProseMirror[contenteditable="true"]');
  await expect(composer).toContainText('chatgpt-conversation.md');
  await expect(composer).not.toContainText('cherry blossoms');

  // The history arrives as a dropped file — this is the part a paste cannot do.
  await expect
    .poll(async () =>
      target.evaluate(
        () => (window as { __droppedFiles?: { name: string; text: string }[] }).__droppedFiles ?? [],
      ),
    )
    .toEqual([
      expect.objectContaining({
        name: 'chatgpt-conversation.md',
        text: expect.stringContaining('cherry blossoms') as unknown as string,
      }),
    ]);
  expect(await target.evaluate(() => (window as { __sendClicks?: number }).__sendClicks ?? 0)).toBe(0);
});

test('forks a Claude conversation into Gemini, in the target platform’s format', async ({ context }) => {
  const source = await context.newPage();
  await source.goto('https://claude.ai/chat/e2e-2');

  await source.locator('.font-claude-response').hover();
  await source.locator('#ulb-fork-button-host #fork').click();

  const dialog = source.locator('#ulb-fork-dialog-host');
  await dialog.locator('#target').selectOption('gemini');
  await dialog.locator('#delivery').selectOption('inline');
  await expect(dialog.locator('#preview')).toHaveValue(/## Previous conversation context/);
  await expect(dialog.locator('#preview')).toHaveValue(/\*Postgres\*/);
  // The brief states where the work stands, ahead of the transcript.
  await expect(dialog.locator('#preview')).toHaveValue(/### Where this stands/);

  const [target] = await Promise.all([
    context.waitForEvent('page'),
    dialog.locator('#transfer').click(),
  ]);
  await arrive(target, 'https://gemini.google.com/app');
  await expect(target.locator('.ql-editor')).toContainText('Which database for a small SaaS?');
});

test('reports a healthy platform in the side panel, and a new chat is not flagged', async ({
  context,
  extensionId,
}) => {
  const chatgpt = await context.newPage();
  await chatgpt.goto('https://chatgpt.com/c/e2e-1');
  const claude = await context.newPage();
  await claude.goto('https://claude.ai/new');
  // Health is reported once each content script has checked its page.
  await chatgpt.locator('#ulb-fork-button-host').waitFor({ state: 'attached' });
  await claude.locator('#ulb-fork-button-host').waitFor({ state: 'attached' });

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/src/views/sidepanel/index.html`);

  const row = (label: string) => panel.locator('.platform-item', { hasText: label });
  await expect(row('ChatGPT').locator('.status-dot')).toHaveClass(/ok/);
  await expect(row('Claude').locator('.status-dot')).toHaveClass(/ok/);
  await expect(row('Gemini').locator('.status-dot')).toHaveClass(/unknown/);
});
