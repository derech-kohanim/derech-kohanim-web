import { cn } from '@/lib/cn';

import styles from './ui.module.css';

export interface SkeletonProps {
  width?: string;
  height?: string;
  radius?: string;
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = 'var(--space-4)',
  radius = 'var(--radius-sm)',
  className,
}: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cn(styles.skeleton, className)}
      style={{ display: 'block', inlineSize: width, blockSize: height, borderRadius: radius }}
    />
  );
}
