'use client';
// Export of the child page (SPEC.md §6.2): a printable view and a PDF
// download of the schedule and record, labeled "Personal record, not an
// official immunization record", pointing to the pediatrician or state
// registry for an official copy. Both use the same localized model.
import { useGate } from '@/components/states/States';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { use, useState } from 'react';
import { useScheduleText } from '@/components/schedule/useScheduleText';
import { useSelectedChild } from '@/components/shell/SelectedChild';
import { useChildRecord } from '@/lib/api/hooks';
import type { ChildRecord, SetUpChild } from '@/lib/api/schemas';
import { schedule } from '@/lib/data';
import { todayISO } from '@/lib/dates';
import type { RecordModel } from '@/lib/export/recordPdf';
import type { ChildSchedule } from '@/lib/schedule';
import { useChildSchedule } from '@/lib/schedule/useChildSchedule';
import s from './record-export.module.css';

export function RecordExportScreen({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = use(params);
  const { children } = useSelectedChild();
  const child = children.find((c) => c.id === childId);
  const sched = useChildSchedule(child);
  const recordQ = useChildRecord(child?.id);
  const record = recordQ.data;
  const gate = useGate([recordQ], !child || !sched || !record);
  if (gate || !child || !sched || !record) return gate;
  return <RecordExport child={child} sched={sched} record={record} />;
}

function useRecordModel(child: SetUpChild, sched: ChildSchedule, record: ChildRecord): RecordModel {
  const t = useTranslations('export');
  const text = useScheduleText();
  const rows: RecordModel['rows'] = sched.series.flatMap((series) =>
    series.doses.map((d): [string, string, string, string] => [
      text.vaccineName(d.vaccineId),
      text.doseLabel(d.doseNumber),
      d.state === 'received' ? t('given') : text.stateLabel(d, child.name),
      d.state === 'received' && d.record?.dateGiven ? text.date(d.record.dateGiven) : '',
    ]),
  );
  // Seasonal and other vaccines outside the dose series (flu, COVID-19…), as recorded.
  const seriesIds = new Set(schedule.series.map((x) => x.vaccineId));
  for (const r of record.doses
    .filter((r) => !seriesIds.has(r.vaccineId) && r.status === 'received')
    .sort((a, b) => (a.dateGiven ?? '').localeCompare(b.dateGiven ?? ''))) {
    rows.push([text.vaccineName(r.vaccineId), text.doseLabel(r.doseNumber), t('given'), r.dateGiven ? text.date(r.dateGiven) : '']);
  }
  const otherRows = record.customVaccines.map((cv): [string, string] => {
    const iso = `${cv.dateGiven.year}-${String(cv.dateGiven.month).padStart(2, '0')}-${String(cv.dateGiven.day ?? 1).padStart(2, '0')}`;
    const when = cv.dateGiven.day ? text.date(iso) : text.monthYear(iso);
    return [cv.nameAsWritten, [when, cv.country, cv.pediatricianConfirmed ? t('confirmed') : t('unconfirmed')].filter(Boolean).join(' · ')];
  });
  return {
    title: t('title'),
    notice: t('notice'),
    pointer: t('pointer'),
    // Birth month and year only (the day isn't shown anywhere).
    childLine: t('childLine', {
      name: child.name,
      born: text.monthYear(child.dateOfBirth),
    }),
    generated: t('generated', { date: text.date(todayISO()) }),
    headers: [t('vaccine'), t('dose'), t('status'), t('dateGiven')],
    rows,
    otherTitle: t('other'),
    otherRows,
  };
}

function RecordExport({ child, sched, record }: { child: SetUpChild; sched: ChildSchedule; record: ChildRecord }) {
  const t = useTranslations('export');
  const model = useRecordModel(child, sched, record);
  const tErr = useTranslations('errors');
  const [making, setMaking] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    setMaking(true);
    setFailed(false);
    try {
      const { buildRecordPdf } = await import('@/lib/export/recordPdf');
      const bytes = await buildRecordPdf(model);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = t('fileName', {
        name: child.name.replace(/[^\p{L}\p{N}]+/gu, '-'),
      });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setFailed(true);
    } finally {
      setMaking(false);
    }
  }

  return (
    <article className={s.page}>
      <div className={`${s.actions} no-print`}>
        <Link href={`/child/${child.id}`} className="btn">
          {t('back')}
        </Link>
        <button type="button" className="btn" onClick={() => window.print()}>
          {t('print')}
        </button>
        <button type="button" className="btn btn-primary" onClick={download} disabled={making}>
          {t('download')}
        </button>
      </div>
      {failed && (
        <p role="alert" className="no-print">
          {tErr('generic')}
        </p>
      )}

      <h1>{model.title}</h1>
      <p className={s.child}>{model.childLine}</p>
      <p className={s.muted}>{model.generated}</p>
      <div className={s.notice} role="note">
        <p className={s.noticeTitle}>{model.notice}</p>
        <p>{model.pointer}</p>
      </div>

      <table className={s.table}>
        <thead>
          <tr>
            {model.headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {c}
                  </th>
                ) : (
                  <td key={j}>{c}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {model.otherRows.length > 0 && (
        <section>
          <h2>{model.otherTitle}</h2>
          <ul className={s.other}>
            {model.otherRows.map(([name, detail]) => (
              <li key={name + detail}>
                <strong>{name}</strong> · {detail}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
