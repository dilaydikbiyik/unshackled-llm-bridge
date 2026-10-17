import { describe, expect, it } from 'vitest';
import { isForkCommand } from './commands';

describe('isForkCommand', () => {
  it('accepts the shortcut message from this extension', () => {
    expect(isForkCommand({ type: 'command/fork' }, 'abc', 'abc')).toBe(true);
  });

  it('ignores a message from any other extension', () => {
    // Same guard the main message channel applies: another extension must not
    // be able to make this one act on the page.
    expect(isForkCommand({ type: 'command/fork' }, 'evil', 'abc')).toBe(false);
  });

  it('ignores anything that is not the command', () => {
    expect(isForkCommand({ type: 'something/else' }, 'abc', 'abc')).toBe(false);
    expect(isForkCommand(null, 'abc', 'abc')).toBe(false);
    expect(isForkCommand('command/fork', 'abc', 'abc')).toBe(false);
  });
});
