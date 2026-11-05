import { expect, test } from './extension';

/**
 * The side panel, driven in the real extension.
 *
 * These sections had only ever been exercised in unit tests, and the complaint
 * that they looked hollow deserved an answer with evidence rather than an
 * assertion. Each test drives the built panel against the real service worker,
 * the real IndexedDB and the real content scripts.
 */
const panelUrl = (extensionId: string) =>
  `chrome-extension://${extensionId}/src/views/sidepanel/index.html`;

test('archive: records a visited conversation, finds it, exports it', async ({
  context,
  extensionId,
}) => {
  const panel = await context.newPage();
  await panel.goto(panelUrl(extensionId));

  // Off by default: the section explains itself rather than offering a search.
  await expect(panel.getByText(/Archiving is off|Arşivleme kapalı/)).toBeVisible();
  await panel.locator('#archive-toggle').check();
  await expect(panel.locator('#archive-search')).toBeVisible();

  // Visiting a conversation is what fills the archive.
  const chat = await context.newPage();
  await chat.goto('https://chatgpt.com/c/panel-1');
  await expect(chat.locator('[data-content-search-unit-key$=":assistant"]')).toBeVisible();
  await chat.waitForTimeout(1500);

  await panel.reload();
  await panel.locator('#archive-search').fill('Kyoto');
  await expect(panel.locator('#archive-results li').first()).toContainText(/Kyoto/i);

  // And the export is a real file, not a button that does nothing.
  const [download] = await Promise.all([
    panel.waitForEvent('download'),
    panel.locator('[data-export="markdown"]').first().click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.md$/);
});

test('portable memory: draws a profile from the archive the user owns', async ({
  context,
  extensionId,
}) => {
  const panel = await context.newPage();
  await panel.goto(panelUrl(extensionId));
  await panel.locator('#archive-toggle').check();

  for (const path of ['/c/mem-1', '/c/mem-2', '/c/mem-3']) {
    const chat = await context.newPage();
    await chat.goto(`https://chatgpt.com${path}`);
    await expect(chat.locator('[data-content-search-unit-key$=":assistant"]')).toBeVisible();
    await chat.waitForTimeout(800);
    await chat.close();
  }

  await panel.reload();
  await panel.locator('#persona-distil').click();

  // A draft, counted from the user's own conversations, left for them to edit.
  const draft = panel.locator('#persona-text');
  await expect(draft).toHaveValue(/ChatGPT/);
  await expect(draft).toHaveValue(/conversations/);
});

test('parallel comparison: the same prompt reaches each platform, unsent', async ({
  context,
  extensionId,
}) => {
  const panel = await context.newPage();
  await panel.goto(panelUrl(extensionId));

  await panel.locator('#compare-text').fill('Which database for a small SaaS?');
  // Two targets is enough to prove the fan-out, and keeps the test quick.
  await panel.locator('.compare-target[value="gemini"]').uncheck();

  const before = context.pages().length;
  await panel.locator('#compare-send').click();
  // One tab per target, staggered so the platforms are not hit in a burst.
  await expect.poll(() => context.pages().length, { timeout: 10_000 }).toBe(before + 2);

  // Playwright cannot route the first navigation of a tab the extension opens
  // (see arrive() in fork.spec.ts), so each platform is loaded fresh through
  // the fixture routes. The prompt is parked per platform, not per tab, so
  // whichever tab of that platform loads next is the one that receives it.
  for (const url of ['https://chatgpt.com/', 'https://claude.ai/new']) {
    const target = await context.newPage();
    await target.goto(url);
    const composer = target.locator('[contenteditable="true"]').first();
    await expect(composer).toContainText('Which database', { timeout: 15_000 });
    // Filled, never sent: pressing send is the user's.
    expect(await target.evaluate(() => (window as { __sendClicks?: number }).__sendClicks ?? 0)).toBe(0);
  }

  // And the panel is now holding the comparison, waiting for answers.
  await expect(panel.locator('#compare-results')).toContainText('Which database');
});
