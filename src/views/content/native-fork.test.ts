// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountNativeForks, NATIVE_FORK_CLASS } from './native-fork';

function page() {
  document.body.innerHTML = `
    <div class="turn" id="t0"><p>soru</p><div class="bar"><button class="site-btn" data-variant="ghost"><svg width="20"></svg></button></div></div>
    <div class="turn" id="t1"><p>cevap</p><div class="bar"><span class="wrap"><button class="site-btn"><svg width="20"></svg></button></span></div></div>
    <div class="turn" id="t2"><p>yazılıyor</p></div>`;
  const onFork = vi.fn();
  const forks = mountNativeForks({
    locateMessages: () => [...document.querySelectorAll('.turn')],
    locateActionBar: (turn) => turn.querySelector('.bar'),
    onFork,
    label: 'Fork',
  });
  return { onFork, forks };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('fork in the site’s own action bar', () => {
  it('joins each bar, styled like the site’s own buttons', () => {
    const { forks } = page();
    const buttons = document.querySelectorAll<HTMLButtonElement>(`.${NATIVE_FORK_CLASS}`);
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.classList.contains('site-btn')).toBe(true);
    expect(buttons[0]!.getAttribute('data-variant')).toBe('ghost');
    expect(buttons[0]!.getAttribute('aria-label')).toBe('Fork');
    expect(buttons[0]!.querySelector('svg')?.getAttribute('width')).toBe('20');
    forks.unmount();
  });

  it('is wrapped the way the site wraps its buttons', () => {
    const { forks } = page();
    const second = document.querySelector('#t1 .bar')!;
    expect([...second.children].map((c) => c.className)).toEqual(['wrap', 'wrap']);
    forks.unmount();
  });

  it('forks from its own message', () => {
    const { onFork, forks } = page();
    document.querySelector<HTMLButtonElement>(`#t1 .${NATIVE_FORK_CLASS}`)!.click();
    expect(onFork).toHaveBeenCalledWith(1);
    forks.unmount();
  });

  it('says which turns it covers, so the floating handle stays away from them', () => {
    const { forks } = page();
    expect(forks.has(document.querySelector('#t0')!)).toBe(true);
    expect(forks.has(document.querySelector('#t2')!)).toBe(false);
    forks.unmount();
  });

  it('comes back when the site re-renders a bar', async () => {
    const { forks } = page();
    const bar = document.querySelector('#t0 .bar')!;
    bar.innerHTML = '<button class="site-btn">x</button>';
    await vi.waitFor(() => expect(bar.querySelector(`.${NATIVE_FORK_CLASS}`)).not.toBeNull(), { timeout: 2000 });
    forks.unmount();
  });

  it('leaves nothing behind when unmounted', () => {
    const { forks } = page();
    forks.unmount();
    expect(document.querySelectorAll(`.${NATIVE_FORK_CLASS}`)).toHaveLength(0);
    expect(document.querySelectorAll('#t1 .bar .wrap')).toHaveLength(1);
  });
});
