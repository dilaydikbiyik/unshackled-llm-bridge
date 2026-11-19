import { describe, expect, it } from 'vitest';
import {
  prepareDocuments,
  rankSections,
  renderDocuments,
  sectionize,
  type DocumentLine,
  type ExtractedDocument,
} from './landmarks';

const para = (words: string, n = 15) => Array.from({ length: n }, () => words).join(' ');

/** A paper as pdf.js reports it: headings set larger than the body. */
function paper(): ExtractedDocument {
  const lines: DocumentLine[] = [
    { text: 'Türkçe RAG Hakemliği', page: 1, size: 18 },
    { text: '1 Giriş', page: 1, size: 14 },
    { text: para('Bu çalışma büyük dil modellerinin hakemliğini inceler.'), page: 1, size: 10 },
    { text: '2 Yöntem', page: 2, size: 14 },
    { text: para('Etiketleme şeması üç sınıftan oluşur: destekli, desteksiz, çelişkili.'), page: 2, size: 10 },
    { text: para('Annotatörler her iddiayı kanıtla eşleştirir.'), page: 3, size: 10 },
    { text: '3 Bulgular', page: 4, size: 14 },
    { text: para('Hakem modelleri insan değerlendirmesiyle orta düzeyde uyum gösterdi.'), page: 4, size: 10 },
    { text: '4 Sınırlılıklar', page: 5, size: 14 },
    { text: para('Örneklem küçüktür ve tek alanla sınırlıdır.'), page: 5, size: 10 },
  ];
  return { name: 'makale.pdf', pageCount: 5, lines };
}

describe('sectionize', () => {
  it('cuts a PDF at the headings its type size marks, with pages', () => {
    const sections = sectionize(paper());
    const titles = sections.map((s) => s.title);
    expect(titles).toContain('1 Giriş');
    expect(titles).toContain('2 Yöntem');
    const method = sections.find((s) => s.title === '2 Yöntem')!;
    expect(method.firstPage).toBe(2);
    expect(method.lastPage).toBeGreaterThanOrEqual(2);
    expect(sections.map((s) => s.id)).toEqual(sections.map((_, i) => `§${String(i + 1)}`));
  });

  it('takes headings a format marks itself', () => {
    const doc: ExtractedDocument = {
      name: 'notes.md',
      pageCount: 1,
      lines: [
        { text: 'Intro', page: 1, heading: true },
        { text: 'hello', page: 1 },
        { text: 'Setup', page: 1, heading: true },
        { text: 'install it', page: 1 },
      ],
    };
    expect(sectionize(doc).map((s) => s.title)).toEqual(['Intro', 'Setup']);
  });

  it('chunks a document with no headings, titled by its first words', () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({ text: para(`satır ${String(i)} metin`, 20), page: 1 + Math.floor(i / 10) }));
    const sections = sectionize({ name: 'x.txt', pageCount: 4, lines });
    expect(sections.length).toBeGreaterThan(3);
    expect(sections[0]!.title).toMatch(/^satır 0 metin/);
  });
});

describe('rankSections', () => {
  it('puts first the section the conversation is about, Turkish suffixes and all', () => {
    const sections = sectionize(paper());
    const ranked = rankSections(sections, 'Etiketleme şemasında çelişkili sınıfı nasıl tanımlarız?');
    expect(ranked[0]!.title).toBe('2 Yöntem');
  });

  it('takes a page or section named outright before anything else', () => {
    const sections = sectionize(paper());
    expect(rankSections(sections, '5. sayfadaki kısıt ne demek? sayfa 5')[0]!.title).toBe('4 Sınırlılıklar');
    expect(rankSections(sections, 'section 3 hakkında')[0]!.title).toBe('3 Bulgular');
  });
});

describe('prepareDocuments / renderDocuments', () => {
  it('carries a small document whole, with no outline', () => {
    const doc: ExtractedDocument = { name: 'kısa.txt', pageCount: 1, lines: [{ text: 'Sadece bir not.', page: 1 }] };
    const text = renderDocuments(prepareDocuments([doc], ''));
    expect(text).toContain('carried in full');
    expect(text).toContain('Sadece bir not.');
    expect(text).not.toContain('Outline');
  });

  it('carries the relevant sections of a large document and names the rest by landmark', () => {
    const prepared = prepareDocuments([paper()], 'etiketleme şeması ve çelişkili iddialar', 900);
    const text = renderDocuments(prepared);
    expect(text).toContain('Outline');
    expect(text).toMatch(/\[✓\] §\d+ · 2 Yöntem · p\.2/);
    expect(text).toMatch(/\[ \] §\d+ · 4 Sınırlılıklar · p\.5/);
    expect(text).toContain('Etiketleme şeması');
    expect(text).not.toContain('Örneklem küçüktür');
    expect(text).toContain('ask me for it by its landmark');
  });

  it('stays inside the budget', () => {
    const [doc] = prepareDocuments([paper()], 'hakem bulgular yöntem giriş sınırlılık', 700);
    const carried = doc!.sections.filter((s) => doc!.included.has(s.id)).reduce((n, s) => n + s.tokens, 0);
    expect(carried).toBeLessThanOrEqual(700);
  });

  it('carries the opening when the conversation points nowhere in particular', () => {
    const [doc] = prepareDocuments([paper()], 'merhaba', 900);
    expect(doc!.included.has('§1')).toBe(true);
  });

  it('renders nothing for no documents', () => {
    expect(renderDocuments([])).toBe('');
  });
});
