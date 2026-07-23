import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

import styles from './ui.module.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'raised' | 'flat' | 'muted' | 'default';
  interactive?: boolean;
}

export function Card({
  variant = 'default',
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        styles.card,
        variant !== 'default' && styles[`card--${variant}`],
        interactive && styles['card--interactive'],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className={styles.cardTitle}>{children}</h2>;
}

export function CardSubtitle({ children }: { children: ReactNode }) {
  return <p className={styles.cardSubtitle}>{children}</p>;
}
