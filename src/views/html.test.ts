// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { html, isSafeHtml, setHtml, trusted } from './html';

describe('html tag — escaping by construction', () => {
  it('escapes an interpolated string', () => {
    expect(html`<p>${'<img src=x onerror=alert(1)>'}</p>`.value).toBe(
      '<p>&lt;img src=x onerror=alert(1)&gt;</p>',
    );
  });

  it('escapes an attempt to break out of an attribute', () => {
    expect(html`<input value="${'" autofocus onfocus="x'}">`.value).toBe(
      '<input value="&quot; autofocus onfocus=&quot;x">',
    );
  });

  it('nests SafeHtml without escaping it twice', () => {
    expect(html`<ul>${html`<li>${'a&b'}</li>`}</ul>`.value).toBe('<ul><li>a&amp;b</li></ul>');
  });

  it('renders arrays by rendering each item, escaping the unsafe ones', () => {
    expect(html`${['<a>', html`<b></b>`]}`.value).toBe('&lt;a&gt;<b></b>');
  });

  it('renders false, null and undefined as nothing, but keeps zero', () => {
    expect(html`${false}${null}${undefined}${0}`.value).toBe('0');
  });

  it('cannot be fooled by an object that merely looks like SafeHtml', () => {
    const impostor = { value: '<b>bold</b>' } as unknown as string;
    expect(html`${impostor}`.value).not.toContain('<b>');
  });

  it('passes trusted static markup through unchanged', () => {
    expect(html`<style>${trusted('a > b { color: red }')}</style>`.value).toBe(
      '<style>a > b { color: red }</style>',
    );
  });

  it('identifies SafeHtml', () => {
    expect(isSafeHtml(html`x`)).toBe(true);
    expect(isSafeHtml('x')).toBe(false);
    expect(isSafeHtml(null)).toBe(false);
  });
});

describe('setHtml', () => {
  it('inserts the markup, with interpolated text arriving as text', () => {
    const div = document.createElement('div');
    setHtml(div, html`<span>${'<script>x()</script>'}</span>`);
    expect(div.querySelector('script')).toBeNull();
    expect(div.querySelector('span')?.textContent).toBe('<script>x()</script>');
  });
});
