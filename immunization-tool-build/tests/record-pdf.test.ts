import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildRecordPdf, type RecordModel } from '@/lib/export/recordPdf';

const model = (rows: number): RecordModel => ({
  title: 'Immunization record',
  notice: 'Personal record, not an official immunization record.',
  pointer: 'For an official copy, ask your pediatrician or your state immunization registry.',
  childLine: 'Sofía · Born September 2014',
  generated: 'Created Nov 23, 2026',
  headers: ['Vaccine', 'Dose', 'Status', 'Date given'],
  rows: Array.from({ length: rows }, (_, i) => ['Diphtheria, tetanus and whooping cough (DTaP)', `Dose ${i + 1}`, 'Given', 'Nov 24, 2014']),
  otherTitle: 'Other vaccines',
  otherRows: [['BCG', 'September 2014 · Mexico · Not yet confirmed']],
});

describe('record PDF', () => {
  it('builds a PDF with accented text', async () => {
    const bytes = await buildRecordPdf(model(5));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toContain('Sofía');
  });

  it('flows onto more pages when the record is long', async () => {
    const doc = await PDFDocument.load(await buildRecordPdf(model(80)));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
