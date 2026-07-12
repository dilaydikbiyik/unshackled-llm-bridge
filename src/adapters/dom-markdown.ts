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

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;

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
