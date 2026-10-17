// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConversation } from '@domain/conversation/schema';
import { registerCustomSites } from '@domain/platforms';
import type { TransferPackageBuilder, TransferRequest } from '@domain/transfer';
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings';
import { FORK_BUTTON_HOST_ID, HIDE_DELAY_MS, mountForkButtons } from './fork-button';
import {
  FORK_DIALOG_HOST_ID,
  formatSize,
  openForkDialog,
  RETURN_TARGET,
  type ForkDialogOptions,
} from './fork-dialog';
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
    scopeCounts: () => ({ whole: 2, upToMessage: 1, sinceLast: 0 }),
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
      expect(requests.at(-1)).toEqual({ target: 'gemini', mode: 'trimmed', scope: 'whole', delivery: 'attachment' }),
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

/**
 * Dragging a conversation to the AI next to it, the way a window is dragged to
 * a second monitor. The payload is prepared while the pointer rests on the
 * affordance, because `dragstart` cannot await anything.
 */
describe('fork affordance — drag out', () => {
  const dragged = { fileName: 'chatgpt-conversation.md', fileText: '# t', plainText: 'pkg' };

  function mount(prepareDrag?: () => Promise<typeof dragged | null>) {
    // Earlier tests in this file mount the same host; start from a clean one.
    document.getElementById(FORK_BUTTON_HOST_ID)?.remove();
    document.body.innerHTML = '';
    const message = document.createElement('div');
    document.body.append(message);
    const unmount = mountForkButtons({
      locateMessages: () => [message],
      onFork: () => undefined,
      ...(prepareDrag ? { prepareDrag } : {}),
    });
    message.dispatchEvent(new Event('pointerover', { bubbles: true }));
    const root = document.getElementById(FORK_BUTTON_HOST_ID)!.shadowRoot!;
    return { button: root.getElementById('fork') as HTMLButtonElement, unmount };
  }

  it('is draggable', () => {
    const { button, unmount } = mount();
    // happy-dom does not reflect the property, so assert the attribute.
    expect(button.getAttribute('draggable')).toBe('true');
    unmount();
  });

  it('hands over the conversation once it is prepared', async () => {
    const prepareDrag = vi.fn(async () => dragged);
    const { button, unmount } = mount(prepareDrag);

    button.dispatchEvent(new Event('mouseenter'));

    const dataTransfer = new DataTransfer();
    await vi.waitFor(() => {
      const event = new DragEvent('dragstart', { cancelable: true });
      // happy-dom drops dataTransfer from the constructor, the same gap the
      // file-drop tests work around.
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
      button.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });
    expect(prepareDrag).toHaveBeenCalled();
    expect(dataTransfer.getData('DownloadURL')).toContain('chatgpt-conversation.md');
    unmount();
  });

  it('cancels the drag rather than dragging nothing when preparation has not finished', () => {
    const { button, unmount } = mount(() => new Promise(() => undefined));
    button.dispatchEvent(new Event('mouseenter'));

    const event = new DragEvent('dragstart', { cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: new DataTransfer() });
    button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    unmount();
  });
});

/**
 * The round trip. A platform's own import brings context in and never carries
 * an answer out, because it exists to move people onto that platform. A client
 * that belongs to no provider can offer the way back, and it is the obvious
 * default on a conversation that came from somewhere.
 */
describe('fork dialog — returning to the origin', () => {
  const origin = { platform: 'gemini' as const, label: 'Gemini', url: 'https://gemini.google.com/app/abc' };

  const conversation = createConversation({
    id: 'claude-2',
    sourcePlatform: 'claude',
    createdAt: '2026-10-08T00:00:00Z',
    messages: [{ role: 'user', content: 'hi', index: 0, attachmentRefs: [] }],
    attachments: [],
  });

  function open(patch: Partial<ForkDialogOptions> = {}) {
    const onTransfer = vi.fn(async () => undefined);
    openForkDialog({
      conversation,
      settings: { ...DEFAULT_SETTINGS, language: 'en' },
      attachments: [],
      buildPackage: async (request) => ({
        text: `package for ${request.target}`,
        estimatedTokens: 1,
      }),
      showLengthWarning: false,
      scopeCounts: () => ({ whole: 2, upToMessage: 1, sinceLast: 0 }),
      onTransfer,
      ...patch,
    });
    const root = shadowOf(FORK_DIALOG_HOST_ID)!;
    const $ = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
    return { $, onTransfer };
  }

  it('offers the origin as a target, selected by default', () => {
    const { $ } = open({ origin });
    expect($<HTMLSelectElement>('#target').value).toBe(RETURN_TARGET);
    expect($('#target').textContent).toContain('Gemini');
  });

  it('sends the package back to that exact conversation', async () => {
    const { $, onTransfer } = open({ origin });
    await vi.waitFor(() => expect($<HTMLTextAreaElement>('#preview').value).not.toBe(''));
    $<HTMLButtonElement>('#transfer').click();

    expect(onTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'gemini', returnUrl: 'https://gemini.google.com/app/abc' }),
    );
  });

  it('carries no return address when the user picks an ordinary target', async () => {
    const { $, onTransfer } = open({ origin });
    const target = $<HTMLSelectElement>('#target');
    target.value = 'claude';
    target.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect($<HTMLTextAreaElement>('#preview').value).not.toBe(''));
    $<HTMLButtonElement>('#transfer').click();

    expect(onTransfer).toHaveBeenCalledWith(expect.not.objectContaining({ returnUrl: expect.anything() }));
  });

  it('offers nothing of the sort for a conversation the user simply started', () => {
    const { $ } = open();
    expect($('#target').textContent).not.toContain('⤺');
  });
});

/**
 * Relay: two assistants kept in step over several exchanges. After the first
 * hand-off, each leg should carry only what the other side has missed —
 * otherwise the pair becomes unusable once the history is long.
 */
describe('fork dialog — relaying', () => {
  function open(scopeCounts: Record<string, number>) {
    const requests: TransferRequest[] = [];
    openForkDialog({
      conversation: createConversation({
        id: 'claude-3',
        sourcePlatform: 'claude',
        createdAt: '2026-10-08T00:00:00Z',
        messages: [{ role: 'user', content: 'hi', index: 0, attachmentRefs: [] }],
        attachments: [],
      }),
      settings: { ...DEFAULT_SETTINGS, language: 'en' },
      attachments: [],
      buildPackage: async (request) => {
        requests.push(request);
        return { text: 'package', estimatedTokens: 1 };
      },
      showLengthWarning: false,
      scopeCounts: () => scopeCounts as never,
      onTransfer: vi.fn(async () => undefined),
    });
    const root = shadowOf(FORK_DIALOG_HOST_ID)!;
    return { root, requests };
  }

  it('offers only-what-is-new, and picks it, once the pair has been linked', async () => {
    const { root, requests } = open({ whole: 9, upToMessage: 5, sinceLast: 2 });

    expect(root.querySelector<HTMLSelectElement>('#scope')?.value).toBe('sinceLast');
    expect(root.querySelector('#scope')?.textContent).toContain('(2)');
    await vi.waitFor(() => expect(requests.at(-1)?.scope).toBe('sinceLast'));
  });

  it('offers nothing to relay on a conversation never carried anywhere', () => {
    const { root } = open({ whole: 9, upToMessage: 5, sinceLast: 0 });

    expect(root.querySelector<HTMLSelectElement>('#scope')?.value).toBe('whole');
    // The option stays in the list but is unavailable: the target can change
    // while the dialog is open, and then it becomes meaningful again.
    const since = root.querySelector<HTMLOptionElement>('#scope-since');
    expect(since?.disabled).toBe(true);
    expect(since?.hidden).toBe(true);
  });
});

/**
 * A modal has to be operable without a mouse. Escape dismisses it, Tab stays
 * inside it, and focus starts on the first decision — the target list.
 */
describe('fork dialog — keyboard', () => {
  function open() {
    openForkDialog({
      conversation: createConversation({
        id: 'claude-4',
        sourcePlatform: 'claude',
        createdAt: '2026-10-18T00:00:00Z',
        messages: [{ role: 'user', content: 'hi', index: 0, attachmentRefs: [] }],
        attachments: [],
      }),
      settings: { ...DEFAULT_SETTINGS, language: 'en' },
      attachments: [],
      buildPackage: async () => ({ text: 'package', estimatedTokens: 1 }),
      showLengthWarning: false,
      scopeCounts: () => ({ whole: 1, upToMessage: 1, sinceLast: 0 }),
      onTransfer: vi.fn(async () => undefined),
    });
    return shadowOf(FORK_DIALOG_HOST_ID)!;
  }

  const press = (root: ShadowRoot, key: string, shiftKey = false) =>
    root.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));

  it('opens with focus on the target list', () => {
    const root = open();
    expect((root.activeElement as HTMLElement | null)?.id).toBe('target');
  });

  it('closes on Escape, giving the page back', () => {
    const root = open();
    press(root, 'Escape');
    expect(document.getElementById(FORK_DIALOG_HOST_ID)).toBeNull();
  });

  it('keeps Tab inside the dialog', async () => {
    const root = open();
    // The transfer button is disabled until the package is built, and a
    // disabled control is not in the tab order.
    await vi.waitFor(() =>
      expect(root.querySelector<HTMLButtonElement>('#transfer')?.disabled).toBe(false),
    );
    const items = [...root.querySelectorAll<HTMLElement>('select, textarea, button, input')];
    const first = items[0]!;
    const last = items.at(-1)!;

    last.focus();
    press(root, 'Tab');
    expect(root.activeElement).toBe(first);

    first.focus();
    press(root, 'Tab', true);
    expect(root.activeElement).toBe(last);
  });
});

/**
 * The dialog must ask about the target the user has actually chosen. With the
 * counts fixed at open time, switching to a platform that had seen nothing
 * still offered "only what is new" — and would have sent it a handful of
 * recent turns with no history.
 */
describe('fork dialog — scope follows the target', () => {
  function open() {
    const asked: string[] = [];
    openForkDialog({
      conversation: createConversation({
        id: 'claude-5',
        sourcePlatform: 'claude',
        createdAt: '2026-10-18T00:00:00Z',
        messages: [{ role: 'user', content: 'hi', index: 0, attachmentRefs: [] }],
        attachments: [],
      }),
      settings: { ...DEFAULT_SETTINGS, language: 'en' },
      attachments: [],
      buildPackage: async () => ({ text: 'package', estimatedTokens: 1 }),
      showLengthWarning: false,
      scopeCounts: (target) => {
        asked.push(target);
        // ChatGPT has been relayed to; Gemini has seen nothing.
        return target === 'chatgpt'
          ? { whole: 9, upToMessage: 5, sinceLast: 2 }
          : { whole: 9, upToMessage: 5, sinceLast: 0 };
      },
      onTransfer: vi.fn(async () => undefined),
    });
    const root = shadowOf(FORK_DIALOG_HOST_ID)!;
    return { root, asked };
  }

  it('asks about the target that is selected', () => {
    const { asked } = open();
    expect(asked[0]).toBe('chatgpt');
  });

  it('drops the relay option when the user switches to a target that has seen nothing', async () => {
    const { root } = open();
    expect(root.querySelector<HTMLSelectElement>('#scope')?.value).toBe('sinceLast');

    const target = root.querySelector<HTMLSelectElement>('#target')!;
    target.value = 'gemini';
    target.dispatchEvent(new Event('change'));

    await vi.waitFor(() => {
      expect(root.querySelector<HTMLSelectElement>('#scope')?.value).toBe('whole');
      expect(root.querySelector<HTMLOptionElement>('#scope-since')?.disabled).toBe(true);
    });
  });

  it('labels each scope with the size it has for that target', async () => {
    const { root } = open();
    await vi.waitFor(() =>
      expect(root.querySelector('#scope-since')?.textContent).toContain('(2)'),
    );
    expect(root.querySelector('#scope-whole')?.textContent).toContain('(9)');
  });
});

/**
 * What the dialog shows has to be what it will do. A target that takes no
 * uploads starts on inline delivery, and the select used to keep reading
 * "attached as a file" while the transfer went as text.
 */
describe('fork dialog — delivery shown matches delivery used', () => {
  function open(
    sites: { id: string; label: string; acceptsFileUpload: boolean }[],
    origin?: { platform: never; label: string; url: string },
  ) {
    registerCustomSites(
      sites.map((site) => ({
        id: site.id as never,
        label: site.label,
        hosts: [site.label],
        newChatUrl: `https://${site.label}/`,
        acceptsFileUpload: site.acceptsFileUpload,
      })),
    );
    const requests: TransferRequest[] = [];
    openForkDialog({
      conversation: createConversation({
        id: 'claude-6',
        sourcePlatform: 'claude',
        createdAt: '2026-10-18T00:00:00Z',
        messages: [{ role: 'user', content: 'hi', index: 0, attachmentRefs: [] }],
        attachments: [],
      }),
      settings: { ...DEFAULT_SETTINGS, language: 'en' },
      attachments: [],
      buildPackage: async (request) => {
        requests.push(request);
        return { text: 'package', estimatedTokens: 1 };
      },
      showLengthWarning: false,
      scopeCounts: () => ({ whole: 1, upToMessage: 1, sinceLast: 0 }),
      ...(origin ? { origin } : {}),
      onTransfer: vi.fn(async () => undefined),
    });
    return { root: shadowOf(FORK_DIALOG_HOST_ID)!, requests };
  }

  afterEach(() => {
    registerCustomSites([]);
  });

  it('shows inline when returning to a site that takes no files', async () => {
    // The real case: this conversation was forked from a local model's web UI,
    // and the dialog opens with that site as the target. The extension cannot
    // know whether it accepts uploads, so it does not claim that it does.
    const { root, requests } = open(
      [{ id: 'site:localhost', label: 'localhost', acceptsFileUpload: false }],
      { platform: 'site:localhost' as never, label: 'localhost', url: 'http://localhost:3000/' },
    );

    const select = root.querySelector<HTMLSelectElement>('#delivery')!;
    expect(select.value).toBe('inline');
    expect(select.disabled).toBe(true);
    await vi.waitFor(() => expect(requests.at(-1)?.delivery).toBe('inline'));
  });

  it('shows attachment where the target accepts files', () => {
    const { root } = open([]);
    expect(root.querySelector<HTMLSelectElement>('#delivery')?.value).toBe('attachment');
  });
});
