'use client';
// A closable popup on the native <dialog> (showModal): focus moves in and is
// trapped, Escape and the X close it, a tap on the backdrop closes it, and
// focus returns to the button that opened it. Mount it to open it.
import { useTranslations } from 'next-intl';
import { useId, useLayoutEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { XIcon } from '@/components/shell/icons';
import s from './modal.module.css';

export function Modal(props: {
  title: string;
  onClose(): void;
  children: ReactNode;
  /** Buttons along the bottom (e.g. Cancel / Save). */
  footer?: ReactNode;
  /** Makes the popup a form: Save submits it, Enter in a field submits it. */
  onSubmit?(e: FormEvent<HTMLFormElement>): void;
  testId?: string;
}) {
  const { title, onClose, children, footer, onSubmit, testId } = props;
  const t = useTranslations('modal');
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Open while mounted (and shown). Next keeps a left page mounted but hidden:
  // the cleanup closes the popup with it, and it reopens if the page comes back.
  useLayoutEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  const inner = (
    <>
      <header className={s.header}>
        <h2 id={titleId} className={s.title}>
          {title}
        </h2>
        <button type="button" className={s.close} aria-label={t('close')} onClick={onClose}>
          <XIcon />
        </button>
      </header>
      <div className={s.body}>{children}</div>
      {footer && <footer className={s.footer}>{footer}</footer>}
    </>
  );

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby={titleId}
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault(); // Escape: let the parent close (and unmount) it
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // the backdrop
      }}
    >
      {onSubmit ? (
        <form className={s.panel} noValidate onSubmit={onSubmit}>
          {inner}
        </form>
      ) : (
        <div className={s.panel}>{inner}</div>
      )}
    </dialog>
  );
}
