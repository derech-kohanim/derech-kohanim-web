import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import styles from './ui.module.css';

export type BadgeTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'solidSuccess'
  | 'solidDanger'
  | 'solidWarning';

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', icon, children, className }: BadgeProps) {
  return (
    <span className={cn(styles.badge, styles[`badge--${tone}`], className)}>
      {icon}
      {children}
    </span>
  );
}
