// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createFileTransfer, dispatchFileDrop, DROP_SEQUENCE } from './file-drop';

describe('file replay payload', () => {
  it('wraps a stored blob back into a named File', () => {
    const transfer = createFileTransfer(new Blob(['a,b\n1,2'], { type: 'text/csv' }), 'sales.csv');
    expect(transfer.files).toHaveLength(1);
    expect(transfer.files[0]?.name).toBe('sales.csv');
    expect(transfer.files[0]?.type).toBe('text/csv');
  });
});

describe('file replay dispatch', () => {
  it('fires the full drag sequence, not just a drop', () => {
    document.body.innerHTML = '<div id="zone"></div>';
    const zone = document.getElementById('zone')!;
    const seen: string[] = [];
    for (const type of DROP_SEQUENCE) zone.addEventListener(type, () => seen.push(type));

    dispatchFileDrop(zone, createFileTransfer(new Blob(['x']), 'x.txt'));
    expect(seen).toEqual([...DROP_SEQUENCE]);
  });

  it('bubbles so platform handlers mounted higher up still see it', () => {
    document.body.innerHTML = '<main id="outer"><div id="zone"></div></main>';
    let bubbled = false;
    document.getElementById('outer')!.addEventListener('drop', () => {
      bubbled = true;
    });

    dispatchFileDrop(document.getElementById('zone')!, createFileTransfer(new Blob(['x']), 'x.txt'));
    expect(bubbled).toBe(true);
  });
});
