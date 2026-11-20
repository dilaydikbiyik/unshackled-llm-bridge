import { samplePdf } from '../src/data/documents/sample-pdf';
import { expect, forkFrom, test } from './extension';

/**
 * A PDF uploaded into the conversation travels as text: an outline with
 * landmarks and the sections that matter, read on the user's machine with
 * pdf.js — which has to load inside a content script on someone else's page.
 */
test('carries an uploaded PDF as text, and does not upload it again', async ({ context, extensionId }) => {
  // Capture only takes files a person chose (isTrusted), and Playwright's file
  // input events are not trusted — so the upload is stored the way capture
  // stores it, from an extension page.
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/views/sidepanel/index.html`);
  const stored = await page.evaluate(async (base64) => {
    return chrome.runtime.sendMessage({
      type: 'attachment/capture',
      meta: {
        name: 'paper.pdf',
        mime: 'application/pdf',
        size: atob(base64).length,
        sourcePlatform: 'chatgpt',
        conversationKey: 'chatgpt:/c/e2e-docs',
        capturedAt: new Date().toISOString(),
      },
      dataBase64: base64,
    }) as Promise<{ id?: string }>;
  }, Buffer.from(samplePdf()).toString('base64'));
  expect(stored.id).toBeTruthy();
  await page.close();

  const source = await context.newPage();
  await source.goto('https://chatgpt.com/c/e2e-docs');

  await forkFrom(source.locator('[data-content-search-unit-key$=":assistant"]'));

  const dialog = source.locator('#ulb-fork-dialog-host');
  await expect(dialog.locator('.att')).toHaveCount(1);
  await expect(dialog.locator('#documents')).toHaveValue('text');

  await dialog.locator('#delivery').selectOption('inline');
  const preview = dialog.locator('#preview');
  await expect(preview).toHaveValue(/### paper\.pdf/);
  await expect(preview).toHaveValue(/Introduction/);
  await expect(preview).toHaveValue(/The study looks at judges\./);
  await expect(preview).toHaveValue(/Second page body text\./);

  // Switched back to files: the text goes, and the file is uploaded instead.
  await dialog.locator('#documents').selectOption('file');
  await expect(preview).not.toHaveValue(/### paper\.pdf/);
});

test('reads a document picked in the dialog, without it being uploaded to the chat', async ({ context }) => {
  const source = await context.newPage();
  await source.goto('https://chatgpt.com/c/e2e-picked');
  await forkFrom(source.locator('[data-content-search-unit-key$=":assistant"]'));

  const dialog = source.locator('#ulb-fork-dialog-host');
  await dialog.locator('#delivery').selectOption('inline');
  await dialog.locator('#add-docs').setInputFiles({
    name: 'notes.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(samplePdf()),
  });
  const preview = dialog.locator('#preview');
  await expect(preview).toHaveValue(/### notes\.pdf/);
  await expect(preview).toHaveValue(/The study looks at judges\./);
  await expect(dialog.locator('.picked')).toHaveCount(1);

  // Unticked, it leaves the package.
  await dialog.locator('.picked').uncheck();
  await expect(preview).not.toHaveValue(/### notes\.pdf/);
});
