import { CUSTOM_SITE, expect, forkFrom, test } from './extension';

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

test('learned preferences: an instruction repeated across chats becomes a proposal', async ({
  context,
  extensionId,
}) => {
  const panel = await context.newPage();
  await panel.goto(panelUrl(extensionId));
  await panel.locator('#archive-toggle').check();

  // The user asks for shorter answers in two separate conversations.
  for (const path of ['/c/pref-1', '/c/pref-2']) {
    const chat = await context.newPage();
    await chat.goto(`https://chatgpt.com${path}`);
    await expect(chat.locator('[data-content-search-unit-key$=":assistant"]')).toBeVisible();
    await chat.waitForTimeout(800);
    await chat.close();
  }

  await panel.reload();
  await panel.locator('#persona-distil').click();

  // Proposed with its evidence, and written into the draft — not saved.
  const learned = panel.locator('#persona-learned');
  await expect(learned).toContainText(/2 (conversations|sohbette)/);
  await expect(panel.locator('#persona-text')).toHaveValue(/Keep answers short/);

  // Unticked, it leaves the draft.
  await learned.locator('.learned-toggle[value="shorter"]').uncheck();
  await expect(panel.locator('#persona-text')).not.toHaveValue(/Keep answers short/);
});

/**
 * The whole point of adding a site: the extension then runs on it.
 *
 * Content scripts are built as a small loader that imports the real module at
 * runtime, and that import is only allowed on origins the module is web
 * accessible to. Those were exactly the three built-in sites — so on every site
 * a user added, the script was registered, the loader ran, and the import was
 * refused. Nothing in the suite had ever loaded the extension on a site it was
 * not built for.
 */
test('a site the user adds: the extension actually runs on it', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(panelUrl(extensionId));

  await panel.locator('#site-host').fill(CUSTOM_SITE);
  await panel.locator('#site-add').click();
  await expect(panel.locator('.site-list')).toContainText(CUSTOM_SITE);

  // The worker registers the content script for the new site.
  await panel.waitForTimeout(1000);

  const site = await context.newPage();
  await site.goto(`https://${CUSTOM_SITE}/c/abc123`);

  // The in-page UI is there — the module loaded, on a site it was never built for.
  await expect
    .poll(() => site.evaluate(() => !!document.getElementById('ulb-fork-button-host')), {
      timeout: 15_000,
    })
    .toBe(true);

  // And it does the job: the generic adapter reads a page no selectors were
  // written for, and the fork carries both sides of the conversation.
  await forkFrom(site.locator('.msg').nth(1));
  const dialog = site.locator('#ulb-fork-dialog-host');
  await dialog.locator('#delivery').selectOption('inline');
  const preview = dialog.locator('#preview');
  await expect(preview).toHaveValue(/mutex and a semaphore/);
  await expect(preview).toHaveValue(/admits one holder at a time/);
});

test('portable memory: a saved profile travels with a fork only when ticked', async ({
  context,
  extensionId,
}) => {
  const panel = await context.newPage();
  await panel.goto(panelUrl(extensionId));
  await panel.locator('#persona-name').fill('İş');
  await panel.locator('#persona-text').fill('Kısa ve maddeli cevap ver. Türkçe yaz.');
  await panel.locator('#persona-save').click();
  await expect(panel.locator('#persona-select option:checked')).toHaveText(/İş/);

  const chat = await context.newPage();
  await chat.goto('https://chatgpt.com/c/persona-1');
  await forkFrom(chat.locator('[data-content-search-unit-key$=":assistant"]'));

  const dialog = chat.locator('#ulb-fork-dialog-host');
  await dialog.locator('#delivery').selectOption('inline');
  const preview = dialog.locator('#preview');
  await expect(preview).toHaveValue(/Plan a trip to Kyoto/);
  // Off by default: the profile is the user's to share, per transfer.
  await expect(dialog.locator('#persona')).not.toBeChecked();
  await expect(preview).not.toHaveValue(/Kısa ve maddeli/);

  await dialog.locator('#persona').check();
  await expect(preview).toHaveValue(/<about_me>\nKısa ve maddeli cevap ver\. Türkçe yaz\.\n<\/about_me>/);
});
