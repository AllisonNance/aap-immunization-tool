// A deliberately small Markdown reader for guide content (SPEC.md §6.7):
// front matter, # / ## headings, paragraphs, "- " lists, **bold** and
// [links](url). No raw HTML is ever produced; the renderer builds React
// elements from this tree. Pure.

export type Inline = { kind: 'text'; text: string } | { kind: 'bold'; text: string } | { kind: 'link'; text: string; href: string };

export type Block =
  | { kind: 'h1' | 'h2' | 'h3'; content: Inline[] }
  | { kind: 'p'; content: Inline[] }
  | { kind: 'ul'; items: Inline[][] };

export interface MarkdownDoc {
  meta: Record<string, string | boolean>;
  blocks: Block[];
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'bold', text: m[1] });
    else out.push({ kind: 'link', text: m[2], href: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

function parseMeta(lines: string[]): Record<string, string | boolean> {
  const meta: Record<string, string | boolean> = {};
  for (const line of lines) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, '');
    meta[m[1]] = v === 'true' ? true : v === 'false' ? false : v;
  }
  return meta;
}

export function parseMarkdown(source: string): MarkdownDoc {
  let lines = source.replace(/\r\n/g, '\n').split('\n');
  let meta: Record<string, string | boolean> = {};
  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      meta = parseMeta(lines.slice(1, end));
      lines = lines.slice(end + 1);
    }
  }

  const blocks: Block[] = [];
  let para: string[] = [];
  let list: Inline[][] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', content: parseInline(para.join(' ')) });
    para = [];
    if (list) blocks.push({ kind: 'ul', items: list });
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: (['h1', 'h2', 'h3'] as const)[heading[1].length - 1], content: parseInline(heading[2]) });
      continue;
    }
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item) {
      if (para.length) {
        blocks.push({ kind: 'p', content: parseInline(para.join(' ')) });
        para = [];
      }
      (list ??= []).push(parseInline(item[1]));
      continue;
    }
    if (list) flush();
    para.push(line);
  }
  flush();
  return { meta, blocks };
}
