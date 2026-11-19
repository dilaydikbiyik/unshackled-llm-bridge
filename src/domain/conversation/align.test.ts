import { describe, expect, it } from 'vitest';
import { alignCutIndex } from './align';

const m = (role: 'user' | 'assistant', content: string) => ({ role, content });
const whole = [
  m('user', 'a'), m('assistant', 'A'), m('user', 'b'), m('assistant', 'B'),
  m('user', 'c'), m('assistant', 'C'),
];

describe('alignCutIndex', () => {
  it('moves a visible position to its place in the whole conversation', () => {
    expect(alignCutIndex([m('user', 'b'), m('assistant', 'B')], whole, 1)).toBe(3);
  });

  it('keeps the position when everything was visible', () => {
    expect(alignCutIndex(whole, whole, 2)).toBe(2);
  });

  it('prefers the latest match when text repeats', () => {
    const repeated = [m('user', 'ok'), m('assistant', 'X'), m('user', 'ok'), m('assistant', 'X')];
    expect(alignCutIndex([m('user', 'ok'), m('assistant', 'X')], [...repeated, m('user', 'z')], 0)).toBe(2);
  });

  it('keeps the visible position when the stretch is not found', () => {
    expect(alignCutIndex([m('user', 'zzz')], whole, 0)).toBe(0);
  });
});
