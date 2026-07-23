import { cn } from '@/lib/cn';

import styles from './ui.module.css';

const SIZES = { small: 'var(--space-4)', medium: 'var(--space-6)', large: 'var(--space-8)' };

export interface SpinnerProps {
  size?: keyof typeof SIZES;
  label?: string;
  className?: string;
}

export function Spinner({ size = 'medium', label, className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(styles.spinner, className)}
      style={{ inlineSize: SIZES[size], blockSize: SIZES[size] }}
    />
  );
}
