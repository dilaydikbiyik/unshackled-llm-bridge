import { expect, test } from './extension';

/**
 * Fork as one of the site's own message actions: in the bar with copy and
 * "⋯", styled like its neighbours, under both the prompt and the reply.
 */
test('puts Fork in each message’s own action bar, and it opens the dialog', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('https://chatgpt.com/c/actions-1');

  const forks = page.locator('.ulb-native-fork');
  await expect(forks).toHaveCount(2);
  // Styled by the site's own classes, sitting after the reply's "⋯".
  await expect(forks.nth(1)).toHaveClass(/site-btn/);
  // In the same inner row as the site's buttons, wrapped like "⋯" is.
  const row = await page.locator('.turn-action-controls .bar').nth(0).evaluate((bar) =>
    [...bar.children].map((c) => `${c.tagName.toLowerCase()}.${c.className}:${c.querySelector('button')?.getAttribute('aria-label') ?? c.getAttribute('aria-label') ?? ''}`),
  );
  expect(row).toEqual(['button.site-btn:Kopyala', 'span.wrap:Diğer işlemler', 'span.wrap:Fork']);

  // The floating handle stays out of the way of a message that has its own.
  await page.locator('[data-content-search-unit-key$=":assistant"]').hover();
  await expect(page.locator('#ulb-fork-button-host #fork')).toBeHidden();

  await forks.nth(1).click();
  const dialog = page.locator('#ulb-fork-dialog-host');
  await expect(dialog.locator('#scope-whole')).toHaveText(/\(2\)/);
  await dialog.locator('#delivery').selectOption('inline');
  await expect(dialog.locator('#preview')).toHaveValue(/kiraz çiçekleri/);
});

test('brings Fork back when the site re-renders a reply’s bar', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('https://chatgpt.com/c/actions-2');
  await expect(page.locator('.ulb-native-fork')).toHaveCount(2);
  await page.evaluate(() => {
    const bar = document.querySelectorAll('.turn-action-controls')[1]!;
    bar.innerHTML = '<button class="site-btn" aria-label="Kopyala">c</button>';
  });
  await expect(page.locator('.ulb-native-fork')).toHaveCount(2);
});
