import type { Maneuver, RouteResult } from '@dk/shared';
import { useTranslation } from 'react-i18next';

import { Sheet } from '@/components/ui';
import { currentLanguage } from '@/i18n';
import { formatDistance } from '@/lib/format';
import { isZoneManeuver, maneuverIcon, maneuverText } from '@/lib/maneuver';

import styles from './navigation.module.css';

export interface StepListProps {
  open: boolean;
  onClose: () => void;
  route: RouteResult;
  currentIndex: number;
}

/** The whole route as a scrollable step list, opened by tapping the next-step banner. */
export function StepList({ open, onClose, route, currentIndex }: StepListProps) {
  const { t } = useTranslation();
  const language = currentLanguage();

  return (
    <Sheet open={open} onClose={onClose} title={t('navigation.stepListTitle')}>
      <ol className={styles.stepList}>
        {route.maneuvers.map((maneuver: Maneuver, index) => {
          const Icon = maneuverIcon(maneuver.action);
          const zone = isZoneManeuver(maneuver.action);
          const current = index === currentIndex;
          return (
            <li
              key={maneuver.id}
              className={`${styles.step} ${zone ? styles['step--zone'] : ''} ${
                current ? styles['step--current'] : ''
              }`}
              aria-current={current ? 'step' : undefined}
            >
              <span className={styles.stepIcon}>
                <Icon size={22} aria-hidden />
              </span>
              <span className={styles.stepText}>
                <span className={styles.stepInstruction}>
                  {maneuverText(maneuver, t, language)}
                </span>
                {current && <span className={styles.stepNow}>{t('navigation.currentStep')}</span>}
              </span>
              {maneuver.distanceMeters > 0 && (
                <span className={styles.stepDistance}>
                  {formatDistance(maneuver.distanceMeters, language)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </Sheet>
  );
}
