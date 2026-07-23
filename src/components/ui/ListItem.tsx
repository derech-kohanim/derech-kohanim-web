import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

import styles from './ui.module.css';

export interface ListItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  /** Renders a plain row instead of a button. */
  asStatic?: boolean;
}

export function ListItem({
  leading,
  title,
  subtitle,
  trailing,
  asStatic = false,
  className,
  ...rest
}: ListItemProps) {
  const content = (
    <>
      {leading && <span className={styles.listItemLeading}>{leading}</span>}
      <span className={styles.listItemText}>
        <span className={styles.listItemTitle}>{title}</span>
        {subtitle && <span className={styles.listItemSubtitle}>{subtitle}</span>}
      </span>
      {trailing && <span className={styles.listItemTrailing}>{trailing}</span>}
    </>
  );

  if (asStatic) {
    return <div className={cn(styles.listItem, className)}>{content}</div>;
  }

  return (
    <button
      {...rest}
      type="button"
      className={cn(styles.listItem, styles['listItem--interactive'], className)}
    >
      {content}
    </button>
  );
}
