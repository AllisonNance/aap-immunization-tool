import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from '@/lib/markdown';

describe('guide Markdown', () => {
  it('reads front matter, headings, paragraphs and lists', () => {
    const doc = parseMarkdown(`---
title: Catching up
sample: true
---
# Catching up

Missed a dose? It's common.
It can be fixed.

- First item
- Second **item**

## Next
Done.`);
    expect(doc.meta).toEqual({ title: 'Catching up', sample: true });
    expect(doc.blocks.map((b) => b.kind)).toEqual(['h1', 'p', 'ul', 'h2', 'p']);
    expect(doc.blocks[1]).toEqual({ kind: 'p', content: [{ kind: 'text', text: "Missed a dose? It's common. It can be fixed." }] });
    expect(doc.blocks[2]).toMatchObject({ kind: 'ul', items: [[{ text: 'First item' }], [{ text: 'Second ' }, { kind: 'bold', text: 'item' }]] });
  });

  it('reads bold and links inline', () => {
    expect(parseInline('See **this** and [Scan a record](app:scan).')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'bold', text: 'this' },
      { kind: 'text', text: ' and ' },
      { kind: 'link', text: 'Scan a record', href: 'app:scan' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('keeps HTML as plain text', () => {
    expect(parseMarkdown('<script>alert(1)</script>').blocks).toEqual([
      { kind: 'p', content: [{ kind: 'text', text: '<script>alert(1)</script>' }] },
    ]);
  });
});
