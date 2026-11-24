'use client';
// Child switcher (SPEC.md §3), in the header: one pill per child. The selected
// child is expanded to show their first name; the others show their initial.
// Switching reloads the current screen for the new child; it never navigates
// elsewhere. On forms the EditingBanner replaces it.
import { useTranslations } from 'next-intl';
import { useSelectedChild } from './SelectedChild';
import s from './shell.module.css';

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase();
}

// Grayscale fills so neighbouring children are easy to tell apart (never the only cue: the initial is shown).
const shades = [s.shade0, s.shade1, s.shade2, s.shade3];

export function ChildSelector() {
  const t = useTranslations('childSelector');
  const { children, selected, select, noChild, noChildAllowed, selectNoChild } = useSelectedChild();

  if (!selected && !noChild) {
    return <p className={s.switcherNone}>{t('none')}</p>;
  }

  // Vaccines tab: "No child" is one more choice (it hides the child module).
  const canSwitch = children.length > 1 || (noChildAllowed && children.length > 0);

  if (!canSwitch && selected) {
    return (
      <div className={s.switcher}>
        <span className={`${s.chip} ${s.chipSelected}`} data-testid="current-child">
          {selected.name}
        </span>
      </div>
    );
  }

  return (
    <ul className={s.switcher} aria-label={t('label')}>
      {children.map((c, i) => {
        const on = c.id === selected?.id;
        return (
          <li key={c.id}>
            <button
              type="button"
              className={`${s.chip} ${on ? s.chipSelected : shades[i % shades.length]}`}
              aria-pressed={on}
              onClick={() => !on && select(c.id)}
            >
              {on ? (
                c.name
              ) : (
                <>
                  <span aria-hidden>{initial(c.name)}</span>
                  <span className="visually-hidden">{c.name}</span>
                </>
              )}
            </button>
          </li>
        );
      })}
      {noChildAllowed && (
        <li>
          <button type="button" className={`${s.chip} ${noChild ? s.chipSelected : s.chipNone}`} aria-pressed={noChild} onClick={() => !noChild && selectNoChild()}>
            {noChild ? (
              t('noChild')
            ) : (
              <>
                <span aria-hidden>–</span>
                <span className="visually-hidden">{t('noChild')}</span>
              </>
            )}
          </button>
        </li>
      )}
    </ul>
  );
}
