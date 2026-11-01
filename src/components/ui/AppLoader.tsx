import appIcon from '@/assets/images/app-icon.png';
import { cn } from '@/lib/cn';

import styles from './appLoader.module.css';

/**
 * The app's own loading state: the app icon hops like a map pin settling on a destination, with
 * its shadow growing and shrinking beneath it. Used wherever the app waits on the server (pages
 * loading, the route being computed) in place of a generic spinner or a "loading" line.
 */
export function AppLoader({
  label,
  size = 'medium',
  className,
}: {
  /** Shown under the icon and read by screen readers. */
  label?: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}) {
  return (
    <div className={cn(styles.root, styles[`root--${size}`], className)} role="status" aria-live="polite">
      <div className={styles.stage} aria-hidden>
        <img className={styles.icon} src={appIcon} alt="" />
        <span className={styles.shadow} />
      </div>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
