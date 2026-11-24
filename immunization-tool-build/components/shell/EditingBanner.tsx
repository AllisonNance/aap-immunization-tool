'use client';
// "Editing for Maya, 6 months" — pinned on form screens (3, 4, 4a–4d) so the
// caregiver knows which child a change is for. Replaces the child selector.
// (Child Setup, 1c, has no banner: the child's name is its page title.)
import { useTranslations } from 'next-intl';
import { PencilIcon } from './icons';
import { useSelectedChild } from './SelectedChild';
import { useAgeLabel } from './useAgeLabel';
import s from './shell.module.css';

export function EditingBanner() {
  const t = useTranslations('editingBanner');
  const ageLabel = useAgeLabel();
  const { selected } = useSelectedChild();
  if (!selected) return null;
  return (
    <p className={s.editing} role="status" data-testid="editing-banner">
      <PencilIcon />
      {t('text', { name: selected.name, age: ageLabel(selected.dateOfBirth) })}
    </p>
  );
}
