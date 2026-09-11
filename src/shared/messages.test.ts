import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BridgeError,
  dispatch,
  errorEnvelope,
  isAcceptableMessage,
  onRuntimeMessage,
  sendToBackground,
  type HandlerMap,
} from './messages';

const makeHandlers = () =>
  ({
    'archive/search': vi.fn(async () => [{ id: 'hit' }]),
  }) as unknown as HandlerMap;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('message gate', () => {
  const handlers = makeHandlers();

  it('accepts a known message from this extension', () => {
    expect(isAcceptableMessage({ type: 'archive/search', query: '' }, 'me', 'me', handlers)).toBe(
      true,
    );
  });

  it.each([
    ['another extension', 'someone-else'],
    ['a sender with no id, such as a web page', undefined],
  ])('rejects a message from %s', (_label, senderId) => {
    expect(isAcceptableMessage({ type: 'archive/search' }, senderId, 'me', handlers)).toBe(false);
  });

  it.each([
    ['null', null],
    ['a bare string', 'archive/search'],
    ['an object without a type', {}],
    ['an unknown type', { type: 'wipe/everything' }],
    ['an inherited property name', { type: 'toString' }],
  ])('rejects %s', (_label, message) => {
    expect(isAcceptableMessage(message, 'me', 'me', handlers)).toBe(false);
  });
});

describe('dispatch', () => {
  it('routes a message to the handler for its type', async () => {
    const handlers = makeHandlers();
    await expect(dispatch(handlers, { type: 'archive/search', query: 'q' }, {})).resolves.toEqual([
      { id: 'hit' },
    ]);
    expect(handlers['archive/search']).toHaveBeenCalledWith({ type: 'archive/search', query: 'q' }, {});
  });
});

describe('sendToBackground', () => {
  it('resolves with the handler response', async () => {
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(async () => [{ id: 'a' }]) } });
    await expect(sendToBackground({ type: 'archive/search', query: 'x' })).resolves.toEqual([
      { id: 'a' },
    ]);
  });

  it('rethrows a handler failure instead of passing it off as a response', async () => {
    const envelope = errorEnvelope(new Error('database locked'));
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(async () => envelope) } });
    const call = sendToBackground({ type: 'archive/search', query: 'x' });
    await expect(call).rejects.toBeInstanceOf(BridgeError);
    await expect(sendToBackground({ type: 'archive/search', query: 'x' })).rejects.toThrow(
      'database locked',
    );
  });
});

describe('onRuntimeMessage', () => {
  type Listener = (
    message: unknown,
    sender: { id?: string; tab?: { id?: number } },
    sendResponse: (r: unknown) => void,
  ) => boolean;

  function register(handlers: HandlerMap): Listener {
    let listener: Listener = () => false;
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'me',
        onMessage: {
          addListener: (l: Listener) => {
            listener = l;
          },
        },
      },
    });
    onRuntimeMessage(handlers);
    return listener;
  }

  it('answers nothing to an unacceptable message', () => {
    const sendResponse = vi.fn();
    const keepOpen = register(makeHandlers())({ type: 'archive/search' }, { id: 'intruder' }, sendResponse);
    expect(keepOpen).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('keeps the channel open and responds with the handler result', async () => {
    const sendResponse = vi.fn();
    const keepOpen = register(makeHandlers())(
      { type: 'archive/search', query: '' },
      { id: 'me', tab: { id: 7 } },
      sendResponse,
    );
    expect(keepOpen).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith([{ id: 'hit' }]));
  });

  it('sends a failing handler back as an error envelope', async () => {
    const handlers = {
      'archive/search': vi.fn(async () => {
        throw new Error('boom');
      }),
    } as unknown as HandlerMap;
    const sendResponse = vi.fn();
    register(handlers)({ type: 'archive/search', query: '' }, { id: 'me' }, sendResponse);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith(errorEnvelope(new Error('boom'))));
  });
});
