// "Personal record, not an official immunization record" as a PDF
// (SPEC.md §6.2 Export). Built in the browser from already-localized text, so
// it works offline and sends nothing anywhere. Grayscale; no black.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export interface RecordModel {
  title: string;
  notice: string;
  pointer: string;
  childLine: string;
  generated: string;
  headers: [string, string, string, string];
  rows: Array<[string, string, string, string]>;
  otherTitle?: string;
  otherRows: Array<[string, string]>;
}

const INK = rgb(0.24, 0.24, 0.24); // #3d3d3d, the theme's darkest tone
const MUTED = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.74, 0.74, 0.74);
const PAGE = { w: 612, h: 792, margin: 48 }; // US Letter
const COLS = [0.42, 0.13, 0.25, 0.2]; // vaccine, dose, status, date

/** Split text into lines that fit `width` at `size`. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export async function buildRecordPdf(model: RecordModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${model.title} · ${model.childLine}`);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = PAGE.w - PAGE.margin * 2;

  let page: PDFPage = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - PAGE.margin;
  const ensure = (needed: number) => {
    if (y - needed < PAGE.margin) {
      page = doc.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - PAGE.margin;
    }
  };
  const text = (s: string, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; maxWidth?: number } = {}) => {
    const { font = regular, size = 10, color = INK, x = PAGE.margin, maxWidth = width } = opts;
    for (const line of wrap(s, font, size, maxWidth)) {
      ensure(size + 4);
      page.drawText(line, { x, y: y - size, size, font, color });
      y -= size + 4;
    }
  };

  text(model.title, { font: bold, size: 18 });
  y -= 4;
  text(model.childLine, { font: bold, size: 12 });
  text(model.generated, { size: 9, color: MUTED });
  y -= 6;
  // The notice, boxed so it can't be missed.
  const noticeLines = wrap(model.notice, bold, 10, width - 16).length + wrap(model.pointer, regular, 9, width - 16).length;
  const boxH = noticeLines * 14 + 12;
  ensure(boxH);
  page.drawRectangle({ x: PAGE.margin, y: y - boxH, width, height: boxH, borderColor: INK, borderWidth: 1.5 });
  y -= 6;
  text(model.notice, { font: bold, x: PAGE.margin + 8, maxWidth: width - 16 });
  text(model.pointer, { size: 9, x: PAGE.margin + 8, maxWidth: width - 16 });
  y -= 14;

  const row = (cells: string[], font: PDFFont) => {
    const wrapped = cells.map((c, i) => wrap(c, font, 9, COLS[i] * width - 6));
    const h = Math.max(...wrapped.map((w) => w.length)) * 12 + 6;
    ensure(h);
    let x = PAGE.margin;
    wrapped.forEach((lines, i) => {
      lines.forEach((l, j) => page.drawText(l, { x: x + 2, y: y - 12 - j * 12, size: 9, font, color: INK }));
      x += COLS[i] * width;
    });
    y -= h;
    page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.margin + width, y }, thickness: 0.5, color: RULE });
  };
  row(model.headers, bold);
  for (const r of model.rows) row(r, regular);

  if (model.otherTitle && model.otherRows.length) {
    y -= 14;
    text(model.otherTitle, { font: bold, size: 12 });
    for (const [name, detail] of model.otherRows) row([name, '', detail, ''], regular);
  }
  return doc.save();
}
