// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConversation } from '@domain/conversation/schema';
import type { TransferPackageBuilder, TransferRequest } from '@domain/transfer';
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings';
import { FORK_BUTTON_HOST_ID, HIDE_DELAY_MS, mountForkButtons } from './fork-button';
import { FORK_DIALOG_HOST_ID, formatSize, openForkDialog, type ForkDialogOptions } from './fork-dialog';
import { showToast, TOAST_DURATION_MS, TOAST_HOST_ID } from './toast';

const shadowOf = (hostId: string) => document.getElementById(hostId)?.shadowRoot ?? null;

afterEach(() => {
  document.documentElement.querySelectorAll('[id^="ulb-"]').forEach((el) => el.remove());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fork dialog', () => {
  const conversation = createConversation({
    id: 'chatgpt-1',
    sourcePlatform: 'chatgpt',
    createdAt: '2026-09-11T00:00:00Z',
    messages: [{ role: 'user', content: 'hi', index: 0, attachmentRefs: [] }],
    attachments: [],
  });

  function open(patch: Partial<ForkDialogOptions> = {}, settings: Partial<Settings> = {}) {
    const requests: TransferRequest[] = [];
    const buildPackage: TransferPackageBuilder = async (request) => {
      requests.push(request);
      return { text: `package for ${request.target} (${request.mode})`, estimatedTokens: 1234 };
    };
    const onTransfer = vi.fn(async () => undefined);
    const close = openForkDialog({
      conversation,
      settings: { ...DEFAULT_SETTINGS, language: 'en', ...settings },
      attachments: [],
      buildPackage,
      showLengthWarning: false,
    scopeCounts: { whole: 2, upToMessage: 1 },
      onTransfer,
      ...patch,
    });
    const root = shadowOf(FORK_DIALOG_HOST_ID)!;
    const $ = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
    return { root, $, requests, onTransfer, close };
  }

  it('offers only the other platforms and previews the package for the first one', async () => {
    const { $, root } = open();
    expect([...root.querySelectorAll('#target option')].map((o) => o.getAttribute('value'))).toEqual(['claude', 'gemini']);
    await vi.waitFor(() => expect($<HTMLTextAreaElement>('#preview').value).toBe('package for claude (full)'));
    expect($('#tokens').textContent).toContain('1,234');
  });

  it('rebuilds the package when the target or mode changes', async () => {
    const { $, requests } = open();
    const target = $<HTMLSelectElement>('#target');
    target.value = 'gemini';
    target.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect($<HTMLTextAreaElement>('#preview').value).toBe('package for gemini (full)'));

    const mode = $<HTMLSelectElement>('#mode');
    mode.value = 'trimmed';
    mode.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
      expect(requests.at(-1)).toEqual({ target: 'gemini', mode: 'trimmed', scope: 'whole' }),
    );
  });

  // The first real fork transferred a single message, because the dialog only
  // ever carried the slice up to the message it was opened from. Moving the
  // whole conversation is what people mean by forking a chat, so it is the
  // default, and the per-message branch is one select away.
  it('asks for the whole conversation by default, and labels both scopes with their size', async () => {
    const { $, requests } = open();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.scope).toBe('whole');
    expect($<HTMLSelectElement>('#scope').value).toBe('whole');
    expect($('#scope').textContent).toContain('(2)');
    expect($('#scope').textContent).toContain('(1)');
  });

  it('rebuilds for the narrower scope when the user picks it', async () => {
    const { $, requests } = open();
    const scope = $<HTMLSelectElement>('#scope');
    scope.value = 'upToMessage';
    scope.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(requests.at(-1)?.scope).toBe('upToMessage'));
  });

  it('disables summarizing until an API key is set', () => {
    expect(open().$<HTMLOptionElement>('option[value="summary"]').disabled).toBe(true);
    document.getElementById(FORK_DIALOG_HOST_ID)?.remove();
    expect(open({}, { anthropicApiKey: 'sk' }).$<HTMLOptionElement>('option[value="summary"]').disabled).toBe(false);
  });

  it('attaches the persona only when the user ticks it', async () => {
    const { $, requests } = open({}, {
      personas: [{ id: 'p', name: 'Work', text: 'Be terse.' }],
      activePersonaId: 'p',
    });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).not.toHaveProperty('personaText');
    const box = $<HTMLInputElement>('#persona');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(requests.at(-1)?.personaText).toBe('Be terse.'));
  });

  it('transfers the edited text with the files the user kept, and closes', async () => {
    const attachments = [
      { id: 'a1', name: 'spec.pdf', mime: 'application/pdf', size: 2048, sha256: 'x', sourcePlatform: 'chatgpt' as const, conversationKey: 'k', capturedAt: 't' },
      { id: 'a2', name: 'logo.png', mime: 'image/png', size: 10, sha256: 'y', sourcePlatform: 'chatgpt' as const, conversationKey: 'k', capturedAt: 't' },
    ];
    const { $, root, onTransfer } = open({ attachments });
    await vi.waitFor(() => expect($<HTMLTextAreaElement>('#preview').value).not.toBe(''));

    const preview = $<HTMLTextAreaElement>('#preview');
    preview.value = 'edited by hand';
    preview.dispatchEvent(new Event('input'));
    const second = root.querySelector<HTMLInputElement>('.att[value="a2"]')!;
    second.checked = false;
    second.dispatchEvent(new Event('change'));
    $<HTMLButtonElement>('#transfer').click();

    expect(onTransfer).toHaveBeenCalledWith({
      target: 'claude',
      text: 'edited by hand',
      scope: 'whole',
      attachmentIds: ['a1'],
    });
    expect(document.getElementById(FORK_DIALOG_HOST_ID)).toBeNull();
  });

  it('says so when summarizing failed, and warns about length on a full transfer', async () => {
    const { $ } = open({
      showLengthWarning: true,
      buildPackage: async () => ({ text: 'full', estimatedTokens: 1, summaryError: 'rate limited' }),
    });
    await vi.waitFor(() => expect($('#notice').querySelectorAll('.warn')).toHaveLength(2));
    expect($('#notice .err')).not.toBeNull();
  });

  it('copies the package, and cancel closes without transferring', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { $, onTransfer } = open();
    await vi.waitFor(() => expect($<HTMLTextAreaElement>('#preview').value).not.toBe(''));
    $<HTMLButtonElement>('#copy').click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('package for claude (full)'));
    $<HTMLButtonElement>('#cancel').click();
    expect(onTransfer).not.toHaveBeenCalled();
    expect(document.getElementById(FORK_DIALOG_HOST_ID)).toBeNull();
  });

  it('formats file sizes for people', () => {
    expect([formatSize(12), formatSize(2048), formatSize(3.5 * 1024 * 1024)]).toEqual(['12 B', '2 KB', '3.5 MB']);
  });
});

describe('fork button', () => {
  function setup() {
    document.body.innerHTML = '<article id="m0">first</article><article id="m1">second</article>';
    const onFork = vi.fn();
    const unmount = mountForkButtons({
      locateMessages: () => [...document.querySelectorAll('article')],
      onFork,
    });
    const button = shadowOf(FORK_BUTTON_HOST_ID)!.querySelector<HTMLButtonElement>('#fork')!;
    return { onFork, unmount, button };
  }

  it('appears on the hovered message and forks that message', () => {
    const { button, onFork } = setup();
    expect(button.style.display).not.toBe('block');
    document.getElementById('m1')!.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(button.style.display).toBe('block');
    button.click();
    expect(onFork).toHaveBeenCalledWith(1);
  });

  it('ignores the pointer over anything that is not a message', () => {
    const { button } = setup();
    document.body.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(button.style.display).not.toBe('block');
  });

  it('hides after the pointer leaves, unless it moves onto the button', () => {
    vi.useFakeTimers();
    const { button } = setup();
    document.getElementById('m0')!.dispatchEvent(new Event('pointerover', { bubbles: true }));
    document.getElementById('m0')!.dispatchEvent(new Event('pointerleave'));
    button.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(HIDE_DELAY_MS + 1);
    expect(button.style.display).toBe('block');

    document.getElementById('m0')!.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(HIDE_DELAY_MS + 1);
    expect(button.style.display).toBe('none');
  });

  it('removes itself and stops listening when unmounted', () => {
    const { unmount, onFork } = setup();
    unmount();
    expect(document.getElementById(FORK_BUTTON_HOST_ID)).toBeNull();
    document.getElementById('m0')!.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(onFork).not.toHaveBeenCalled();
  });
});

describe('toast', () => {
  it('shows the message as text, never as markup', () => {
    showToast('<img src=x onerror="alert(1)">');
    const root = shadowOf(TOAST_HOST_ID)!;
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('#copy')).toBeNull();
  });

  it('copies the package on request, then gets out of the way', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    showToast('Injection failed', { label: 'Copy', text: 'the package' });
    shadowOf(TOAST_HOST_ID)!.querySelector<HTMLButtonElement>('#copy')!.click();
    await vi.waitFor(() => expect(document.getElementById(TOAST_HOST_ID)).toBeNull());
    expect(writeText).toHaveBeenCalledWith('the package');
  });

  it('closes on request and dismisses itself after a while', () => {
    vi.useFakeTimers();
    showToast('a');
    shadowOf(TOAST_HOST_ID)!.querySelector<HTMLButtonElement>('#close')!.click();
    expect(document.getElementById(TOAST_HOST_ID)).toBeNull();

    showToast('b');
    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(document.getElementById(TOAST_HOST_ID)).toBeNull();
  });
});
