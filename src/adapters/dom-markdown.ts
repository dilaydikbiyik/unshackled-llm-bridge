/**
 * Minimal DOM → markdown extraction shared by adapters. Deliberately small:
 * covers what chat UIs actually render (paragraphs, fenced code, inline
 * marks, lists, headings, links). Anything unknown falls through to its
 * children, so unexpected wrappers degrade to plain text instead of loss.
 */
export function extractMarkdown(root: Element): string {
  return (
    serializeChildren(root)
      // Whitespace between block elements collapses to a single space, which
      // then sits alone on its own line — visible as a blank-looking line that
      // is not blank, on either side of a code block.
      .replace(/\n[ \t]+(?=\n)/g, '\n')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
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

  // Rendered math carries its source. KaTeX keeps the TeX in a MathML
  // annotation beside two renderings of it — a MathML tree and a visual one —
  // and reading the element's text took both: "E=mc^2" arrived as
  // "E=mc2E=mc^2". The annotation is what the author wrote, and what any other
  // assistant reads back as math.
  const tex = mathSource(el);
  if (tex !== null) return isDisplayMath(el) ? `\n\n$$${tex}$$\n\n` : `$${tex}$`;

  // Answers now carry their own controls — ChatGPT ends a reply with a set of
  // choices to pick from. Their buttons are chrome and are dropped, which left
  // the option labels glued together: "30 dakika1 saat2 saat veya daha fazla".
  // Read by ARIA role rather than by any one site's class names.
  if (el.getAttribute('role') === 'radiogroup') return `\n\n${choicesToMarkdown(el)}\n\n`;

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
    case 'del':
    case 's':
    case 'strike':
      // "Use let, not var" read as a recommendation for var once the line
      // through it was lost.
      return `~~${serializeChildren(el)}~~`;
    case 'blockquote':
      return `\n\n${quote(serializeChildren(el))}\n\n`;
    case 'hr':
      return '\n\n---\n\n';
    case 'table':
      return `\n\n${tableToMarkdown(el)}\n\n`;
    case 'li':
      // Only reached for an item outside a list; lists render their own items
      // so that numbering and nesting survive.
      return `\n- ${serializeChildren(el).trim()}`;
    case 'ul':
    case 'ol':
      return `\n\n${listToMarkdown(el, 0)}\n\n`;
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

/**
 * Lists keep their kind and their depth. Ordered lists used to come out as
 * bullets — so step-by-step instructions, the most common shape of an answer,
 * lost the order that was their whole point — and nested items were flattened
 * onto the same level as their parent.
 */
function listToMarkdown(list: Element, depth: number): string {
  const ordered = list.tagName.toLowerCase() === 'ol';
  let n = Number(list.getAttribute('start') ?? '1') || 1;
  const indent = '   '.repeat(depth);
  const lines: string[] = [];

  for (const item of list.children) {
    if (item.tagName.toLowerCase() !== 'li') continue;
    const marker = ordered ? `${String(n)}.` : '-';
    n += 1;

    let text = '';
    const nested: string[] = [];
    for (const child of item.childNodes) {
      const tag =
        child.nodeType === Node.ELEMENT_NODE ? (child as Element).tagName.toLowerCase() : '';
      if (tag === 'ul' || tag === 'ol') nested.push(listToMarkdown(child as Element, depth + 1));
      else text += serializeNode(child);
    }
    lines.push(`${indent}${marker} ${text.replace(/\s*\n\s*/g, ' ').trim()}`);
    lines.push(...nested);
  }
  return lines.join('\n');
}

/**
 * Tables are the commonest structure in an assistant's answer — every
 * comparison is one — and they were being flattened into a run of cell text
 * with nothing between the cells. They travel as GitHub-flavoured Markdown,
 * which every one of these assistants reads and writes.
 */
function tableToMarkdown(table: Element): string {
  const rows = [...table.querySelectorAll('tr')].filter((row) => row.closest('table') === table);
  const cellsOf = (row: Element): string[] =>
    [...row.children]
      .filter((cell) => /^t[hd]$/i.test(cell.tagName))
      .map((cell) =>
        serializeChildren(cell)
          .replace(/\s*\n\s*/g, ' ')
          .trim()
          // A pipe inside a cell would split it in two.
          .replace(/\|/g, '\\|'),
      );

  const grid = rows.map(cellsOf).filter((cells) => cells.length > 0);
  if (grid.length === 0) return serializeChildren(table).trim();

  const width = Math.max(...grid.map((cells) => cells.length));
  const line = (cells: string[]): string =>
    `| ${[...cells, ...Array<string>(width - cells.length).fill('')].join(' | ')} |`;

  const [header = [], ...body] = grid;
  return [line(header), `| ${Array<string>(width).fill('---').join(' | ')} |`, ...body.map(line)].join(
    '\n',
  );
}

/**
 * A group of choices, as a task list: one option per line, the selected one
 * ticked. Task-list syntax states the state without interpreting it — a
 * preselected default and a user's pick look alike in the DOM, so neither is
 * claimed.
 */
function choicesToMarkdown(group: Element): string {
  const options = [...group.querySelectorAll('[role="radio"]')];
  const lines = options
    .map((option) => {
      const id = option.getAttribute('id');
      const label =
        (id ? group.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : null) ??
        option.getAttribute('aria-label') ??
        option.closest('label')?.textContent ??
        option.parentElement?.parentElement?.textContent ??
        '';
      const text = label.replace(/\s+/g, ' ').trim();
      if (!text) return null;
      const checked = option.getAttribute('aria-checked') === 'true';
      return `- [${checked ? 'x' : ' '}] ${text}`;
    })
    .filter((line): line is string => line !== null);
  // A group whose options could not be labelled degrades to its text, which
  // is what it was before rather than nothing at all.
  return lines.length > 0 ? lines.join('\n') : serializeChildren(group).trim();
}

function quote(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n');
}

/** The TeX behind a rendered formula, or null if this is not one. */
function mathSource(el: Element): string | null {
  const isMath =
    el.classList.contains('katex') ||
    el.classList.contains('katex-display') ||
    el.tagName.toLowerCase() === 'math';
  if (!isMath) return null;
  const tex = el.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
  return tex ? tex : null;
}

function isDisplayMath(el: Element): boolean {
  return el.classList.contains('katex-display') || el.closest('.katex-display') !== null;
}

function detectLanguage(el: Element): string {
  const match = /language-([\w-]+)/.exec(el.className);
  return match?.[1] ?? '';
}
