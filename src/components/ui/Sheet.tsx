import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from './IconButton';
import styles from './ui.module.css';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Hides the scrim and the close affordance, for a persistent bottom panel. */
  modal?: boolean;
}

export function Sheet({ open, onClose, title, children, modal = true }: SheetProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !modal) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, modal, onClose]);

  useEffect(() => {
    if (open && modal) panelRef.current?.focus();
  }, [open, modal]);

  if (!open) return null;

  return createPortal(
    <>
      {modal && <div className={styles.scrim} onClick={onClose} />}
      <div
        ref={panelRef}
        className={styles.sheet}
        role={modal ? 'dialog' : undefined}
        aria-modal={modal || undefined}
        aria-label={title}
        tabIndex={-1}
      >
        <span className={styles.sheetGrip} aria-hidden />
        {(title || modal) && (
          <div className={styles.sheetHeader}>
            {title && <h2 className={styles.sheetTitle}>{title}</h2>}
            {modal && (
              <IconButton label={t('common.close')} icon={<X size={20} />} onClick={onClose} />
            )}
          </div>
        )}
        <div className={styles.sheetBody}>{children}</div>
      </div>
    </>,
    document.body,
  );
}
