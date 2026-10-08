/**
 * Minimal DOM → markdown extraction shared by adapters. Deliberately small:
 * covers what chat UIs actually render (paragraphs, fenced code, inline
 * marks, lists, headings, links). Anything unknown falls through to its
 * children, so unexpected wrappers degrade to plain text instead of loss.
 */
export function extractMarkdown(root: Element): string {
  return serializeChildren(root)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function serializeChildren(node: Node): string {
  let out = '';
  node.childNodes.forEach((child) => {
    out += serializeNode(child);
  });
  return out;
}

/**
 * Text that exists for assistive technology only. Gemini renders every user
 * turn twice — once visibly, once as `h5.cdk-visually-hidden` reading
 * "You said: …" — so a transcript that takes it gets each message twice, with
 * a label glued to the front. The transcript should carry what the user sees.
 */
function isAccessibilityOnly(el: Element): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (el.hasAttribute('hidden')) return true;
  const className = typeof el.className === 'string' ? el.className : '';
  return /(^|\s)(sr-only|visually-hidden|cdk-visually-hidden|screen-reader[\w-]*)(\s|$)/.test(
    className,
  );
}

function serializeNode(node: Node): string {
  // HTML collapses runs of whitespace, so the source's own indentation is not
  // text. Keeping it leaked the markup's layout into the transcript — visible
  // on any hand-written UI, including the local model UIs this extension is
  // meant to reach. Block elements add their line breaks separately, and <pre>
  // never reaches here.
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\s+/g, ' ');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  if (isAccessibilityOnly(el)) return '';

  switch (el.tagName.toLowerCase()) {
    case 'pre': {
      // Chat UIs wrap <code> in header/copy-button chrome; only the code counts.
      const code = el.querySelector('code') ?? el;
      const body = (code.textContent ?? '').replace(/\n$/, '');
      return `\n\n\`\`\`${detectLanguage(code)}\n${body}\n\`\`\`\n\n`;
    }
    case 'code':
      return `\`${el.textContent ?? ''}\``;
    case 'strong':
    case 'b':
      return `**${serializeChildren(el)}**`;
    case 'em':
    case 'i':
      return `*${serializeChildren(el)}*`;
    case 'br':
      return '\n';
    case 'p':
      return `\n\n${serializeChildren(el)}\n\n`;
    case 'li':
      return `\n- ${serializeChildren(el).trim()}`;
    case 'ul':
    case 'ol':
      return `\n${serializeChildren(el)}\n`;
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4': {
      const level = Number(el.tagName[1]);
      return `\n\n${'#'.repeat(level)} ${serializeChildren(el)}\n\n`;
    }
    case 'a': {
      const href = el.getAttribute('href') ?? '';
      const text = serializeChildren(el).trim();
      return href.startsWith('http') && text ? `[${text}](${href})` : text;
    }
    case 'img': {
      // Images cannot travel as text, so they are marked where they stood —
      // an image-only turn must not become an empty message.
      const alt = el.getAttribute('alt')?.trim();
      return alt ? `[image: ${alt}]` : '[image]';
    }
    // UI chrome that must never leak into content:
    case 'button':
    case 'svg':
    case 'style':
    case 'script':
      return '';
    default:
      return serializeChildren(el);
  }
}

function detectLanguage(el: Element): string {
  const match = /language-([\w-]+)/.exec(el.className);
  return match?.[1] ?? '';
}
