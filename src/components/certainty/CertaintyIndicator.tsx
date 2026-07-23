import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';

import styles from './certainty.module.css';

export type CertaintyState = 'verified' | 'unverified' | 'zoneAhead';

const ICONS = {
  verified: ShieldCheck,
  unverified: ShieldAlert,
  zoneAhead: AlertTriangle,
};

export interface CertaintyIndicatorProps {
  state: CertaintyState;
  /** The compact form is the one that stays on screen the whole drive. */
  variant?: 'compact' | 'full';
  className?: string;
}

/**
 * Certainty is the product, so it is stated the same way everywhere: colour, symbol and
 * words together, never colour alone.
 */
export function CertaintyIndicator({
  state,
  variant = 'full',
  className,
}: CertaintyIndicatorProps) {
  const { t } = useTranslation();
  const Icon = ICONS[state];

  return (
    <div
      className={cn(styles.root, styles[`root--${state}`], styles[`root--${variant}`], className)}
      role="status"
    >
      <Icon size={variant === 'compact' ? 18 : 22} aria-hidden className={styles.icon} />
      <span className={styles.text}>
        <span className={styles.label}>{t(`certainty.${state}`)}</span>
        {variant === 'full' && (
          <span className={styles.detail}>{t(`certainty.${state}Detail`)}</span>
        )}
      </span>
    </div>
  );
}
