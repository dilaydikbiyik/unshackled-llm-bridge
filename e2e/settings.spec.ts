import type { Page } from '@playwright/test';
import { CUSTOM_SITE, expect, forkFrom, test } from './extension';

/**
 * What the user sets in the side panel, driven through the panel itself: the
 * other suites write settings straight into storage, so a save button that
 * stored nothing, or stored it under the wrong name, would have passed them.
 */
const panelUrl = (extensionId: string) =>
  `chrome-extension://${extensionId}/src/views/sidepanel/index.html`;

async function openPanel(page: Page, extensionId: string): Promise<void> {
  await page.goto(panelUrl(extensionId));
  await expect(page.locator('#settings-save')).toBeVisible();
}

test('first run: the explainer shows once, and stays dismissed', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await openPanel(panel, extensionId);
  await expect(panel.locator('#onboard')).toBeVisible();
  await panel.locator('#onboard-dismiss').click();
  await expect(panel.locator('#onboard')).toHaveCount(0);
  await panel.reload();
  await expect(panel.locator('#settings-save')).toBeVisible();
  await expect(panel.locator('#onboard')).toHaveCount(0);
});

test('language: switching to Turkish turns the panel and the fork dialog Turkish', async ({
  context,
  extensionId,
}) => {
  const panel = await context.newPage();
  await openPanel(panel, extensionId);
  await panel.locator('#settings-lang').selectOption('tr');
  await panel.locator('#settings-save').click();
  await expect(panel.getByRole('heading', { name: 'Ayarlar' })).toBeVisible();
  await panel.reload();
  await expect(panel.locator('#settings-lang')).toHaveValue('tr');

  const chat = await context.newPage();
  await chat.goto('https://chatgpt.com/c/e2e-lang');
  await forkFrom(chat.locator('[data-content-search-unit-key$=":assistant"]'));
  await expect(chat.locator('#ulb-fork-dialog-host #ulb-fork-title')).toHaveText('Sohbeti çatalla');
});

test('API key and model saved in the panel are the ones the summary request uses', async ({
  context,
  extensionId,
}) => {
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
        content: [{ type: 'text', text: 'BRIEF: Kyoto in April, five days.' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 8 },
      }),
    });
  });

  const panel = await context.newPage();
  await openPanel(panel, extensionId);
  // A test value, answered by the stand-in above; nothing reaches Anthropic.
  await panel.locator('#settings-key').fill('  sk-ant-e2e-panel-key  ');
  await panel.locator('#settings-model').selectOption('claude-opus-5-5');
  await panel.locator('#settings-save').click();
  await panel.reload();
  // Trimmed on save, and kept across a reload.
  await expect(panel.locator('#settings-key')).toHaveValue('sk-ant-e2e-panel-key');
  await expect(panel.locator('#settings-model')).toHaveValue('claude-opus-5-5');

  const chat = await context.newPage();
  await chat.goto('https://chatgpt.com/c/e2e-panel-summary');
  await forkFrom(chat.locator('[data-content-search-unit-key$=":assistant"]'));
  const dialog = chat.locator('#ulb-fork-dialog-host');
  await dialog.locator('#delivery').selectOption('inline');
  await dialog.locator('#mode').selectOption('summary');
  await expect(dialog.locator('#preview')).toHaveValue(/BRIEF: Kyoto in April/);
  expect(requests).toEqual([{ model: 'claude-opus-5-5', key: 'sk-ant-e2e-panel-key' }]);
});

test('a site the user adds is also a target: the package lands in its composer, unsent', async ({
  context,
  extensionId,
}) => {
  const panel = await context.newPage();
  await openPanel(panel, extensionId);
  await panel.locator('#site-host').fill(CUSTOM_SITE);
  await panel.locator('#site-add').click();
  await expect(panel.locator('.site-list')).toContainText(CUSTOM_SITE);
  await panel.waitForTimeout(1000);

  const source = await context.newPage();
  await source.goto('https://chatgpt.com/c/e2e-to-custom');
  await forkFrom(source.locator('[data-content-search-unit-key$=":assistant"]'));
  const dialog = source.locator('#ulb-fork-dialog-host');
  await dialog.locator('#target').selectOption(`site:${CUSTOM_SITE}`);
  // A site the extension does not know cannot be handed a file: the package
  // goes inline, and the choice is not offered.
  await expect(dialog.locator('#delivery')).toBeDisabled();
  await expect(dialog.locator('#delivery')).toHaveValue('inline');
  await expect(dialog.locator('#preview')).toHaveValue(/Plan a trip to Kyoto/);

  const [target] = await Promise.all([context.waitForEvent('page'), dialog.locator('#transfer').click()]);
  await expect(target).toHaveURL(new RegExp(CUSTOM_SITE.replace('.', '\\.')));
  const composer = target.locator('.composer');
  await expect(composer).toContainText('Plan a trip to Kyoto', { timeout: 15_000 });
  await expect(composer).toContainText('cherry blossoms');
});
