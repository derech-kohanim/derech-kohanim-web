import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { IconButton } from '@/components/ui';

import styles from './layout.module.css';

export interface ScreenHeaderProps {
  title: string;
  /** Omit to hide the back control. */
  backTo?: string;
  actions?: ReactNode;
}

export function ScreenHeader({ title, backTo, actions }: ScreenHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <header className={styles.header}>
      {backTo && (
        <IconButton
          label={t('common.back')}
          // The arrow points along the reading direction, so it flips with the layout.
          icon={<ArrowRight size={22} className={styles.backIcon} />}
          onClick={() => navigate(backTo)}
        />
      )}
      <h1 className={styles.headerTitle}>{title}</h1>
      {actions}
    </header>
  );
}
