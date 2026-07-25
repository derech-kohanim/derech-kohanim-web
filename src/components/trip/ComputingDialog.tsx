import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button, Dialog } from '@/components/ui';
import { useTrip } from '@/state/TripProvider';

import styles from './computingDialog.module.css';

/**
 * A blocking modal shown while a route compute is in flight. It is the single feedback for the
 * compute step (there is no inline spinner). Cancel aborts the request through the plumbed
 * AbortController and drops back to the last stable state; success and failure both dismiss it
 * automatically as the trip status leaves `computing`.
 */
export function ComputingDialog() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, route, destination, cancel } = useTrip();

  // Name the destination in the title when one is known, so the wait reads as purposeful.
  const destinationName = destination?.title?.trim();
  const title = destinationName
    ? t('route.computingTo', { name: destinationName })
    : t('route.computing');

  const onCancel = useCallback(() => {
    // No route yet means this was a first compute: return to the planning screen cleanly.
    const hadRoute = Boolean(route);
    cancel();
    if (!hadRoute) navigate('/', { replace: true });
  }, [route, cancel, navigate]);

  return (
    <Dialog
      open={status === 'computing'}
      onClose={onCancel}
      title={title}
      busy
      actions={
        <Button variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      }
    >
      <div className={styles.body}>
        <svg
          className={styles.route}
          viewBox="0 0 120 64"
          fill="none"
          aria-hidden
          focusable="false"
        >
          <path
            className={styles.track}
            d="M12 52 C 32 52, 28 16, 52 16 S 88 48, 108 12"
          />
          <path
            className={styles.trace}
            d="M12 52 C 32 52, 28 16, 52 16 S 88 48, 108 12"
          />
          <circle className={styles.start} cx="12" cy="52" r="5" />
          <circle className={styles.end} cx="108" cy="12" r="5" />
        </svg>
        <span className={styles.hint} role="status" aria-live="polite">
          {t('route.computingHint')}
        </span>
      </div>
    </Dialog>
  );
}
