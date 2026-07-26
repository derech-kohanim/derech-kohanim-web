import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import styles from './ui.module.css';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** Marks the dialog as reflecting a background task in progress, for assistive tech. */
  busy?: boolean;
}

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Dialog({ open, onClose, title, children, actions, busy }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Read through a ref rather than depending on onClose: callers pass an inline closure, so the
  // identity changes on every parent render. With it in the dependency list, the effect below
  // re-ran (and re-took focus) on every keystroke typed into a field inside the dialog.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeRef.current();
        return;
      }
      // Trap focus: keep Tab cycling inside the panel so it can never land behind the scrim.
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => !element.hasAttribute('disabled'),
      );
      if (items.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    // Only when the dialog opens. Anything the dialog reveals later (the free-text field behind
    // a thumbs-down) keeps the focus it took for itself.
    const target = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (target ?? panelRef.current)?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <>
      <div className={styles.scrim} onClick={onClose} />
      <div className={styles.dialogLayer}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal
          aria-labelledby={titleId}
          aria-busy={busy || undefined}
          tabIndex={-1}
          className={styles.dialog}
        >
          <h2 id={titleId} className={styles.dialogTitle}>
            {title}
          </h2>
          {children && <div className={styles.dialogBody}>{children}</div>}
          {actions && <div className={styles.dialogActions}>{actions}</div>}
        </div>
      </div>
    </>,
    document.body,
  );
}
