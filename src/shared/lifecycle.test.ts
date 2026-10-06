import { describe, expect, it, vi } from 'vitest';
import { guardContext, isContextAlive, isContextInvalidated } from './lifecycle';

describe('isContextInvalidated', () => {
  it('recognises the error Chrome throws at an orphaned content script', () => {
    expect(isContextInvalidated(new Error('Extension context invalidated.'))).toBe(true);
    expect(isContextInvalidated('Extension context invalidated.')).toBe(true);
  });

  it('does not swallow unrelated failures', () => {
    expect(isContextInvalidated(new Error('Network request failed'))).toBe(false);
    expect(isContextInvalidated(undefined)).toBe(false);
  });
});

describe('isContextAlive', () => {
  it('is false once the runtime has gone away', () => {
    expect(isContextAlive({ id: 'abc' })).toBe(true);
    expect(isContextAlive({})).toBe(false);
    expect(isContextAlive(undefined)).toBe(false);
  });

  it('survives a runtime that throws on access', () => {
    const runtime = {
      get id(): string {
        throw new Error('Extension context invalidated.');
      },
    };
    expect(isContextAlive(runtime)).toBe(false);
  });
});

describe('guardContext', () => {
  it('tears the script down instead of leaking an unhandled rejection', async () => {
    const teardown = vi.fn();
    const result = await guardContext(() => {
      throw new Error('Extension context invalidated.');
    }, teardown);

    expect(result).toBeUndefined();
    expect(teardown).toHaveBeenCalledOnce();
  });

  it('lets a real failure through, so bugs stay visible', async () => {
    const teardown = vi.fn();
    await expect(
      guardContext(() => Promise.reject(new Error('boom')), teardown),
    ).rejects.toThrow('boom');
    expect(teardown).not.toHaveBeenCalled();
  });

  it('returns the value when nothing is wrong', async () => {
    expect(await guardContext(() => Promise.resolve(7), vi.fn())).toBe(7);
  });
});
