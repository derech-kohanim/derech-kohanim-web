import { LocateOff, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';

import styles from './statusBanner.module.css';

interface StatusBannerProps {
  /** Whether the browser currently has network connectivity. */
  online: boolean;
  /** Whether the GPS fix has been lost (omit in views without live positioning). */
  gpsLost?: boolean;
  className?: string;
}

/**
 * Waze-style connectivity/GPS alert: a compact black pill with red text. Renders nothing when
 * everything is healthy. GPS (the more critical loss while driving) is shown first, then the
 * internet pill; both stack when both are lost.
 */
export function StatusBanner({ online, gpsLost = false, className }: StatusBannerProps) {
  const { t } = useTranslation();
  if (online && !gpsLost) return null;

  return (
    <div className={cn(styles.banner, className)} role="alert" aria-live="assertive">
      {gpsLost && (
        <span className={styles.pill}>
          <LocateOff size={16} aria-hidden />
          {t('status.noGps')}
        </span>
      )}
      {!online && (
        <span className={styles.pill}>
          <WifiOff size={16} aria-hidden />
          {t('status.noInternet')}
        </span>
      )}
    </div>
  );
}
