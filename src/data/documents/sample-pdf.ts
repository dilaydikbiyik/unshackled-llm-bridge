/**
 * Test support, never bundled: a minimal two-page PDF written by hand, so the
 * extraction tests and the end-to-end test read a real PDF without a binary
 * fixture in the repository. Page 1 has a 20pt heading over 10pt body text.
 */
export function samplePdf(): ArrayBuffer {
  const page = (stream: string, n: number) => ({ stream, n });
  const pages = [
    page('BT /F1 20 Tf 72 720 Td (Introduction) Tj ET BT /F1 10 Tf 72 690 Td (The study looks at judges.) Tj ET', 1),
    page('BT /F1 10 Tf 72 720 Td (Second page body text.) Tj ET', 2),
  ];
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${String(4 + i * 2)} 0 R`).join(' ')}] /Count ${String(pages.length)} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((p, i) => {
    const pageObj = 4 + i * 2;
    objects[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${String(pageObj + 1)} 0 R >>`;
    objects[pageObj + 1] = `<< /Length ${String(p.stream.length)} >>\nstream\n${p.stream}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = out.length;
    out += `${String(i)} 0 obj\n${objects[i]!}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${String(objects.length)}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i += 1) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${String(objects.length)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF`;
  const bytes = new TextEncoder().encode(out);
  return bytes.buffer.slice(0) as ArrayBuffer;
}

