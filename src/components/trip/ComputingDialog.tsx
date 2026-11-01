import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { AppLoader, Button, Dialog } from '@/components/ui';
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
        <AppLoader label={t('route.computingHint')} />
      </div>
    </Dialog>
  );
}
