import { AlertTriangle, Ban, Car, ShieldAlert, Turtle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Sheet } from '@/components/ui';

import { REPORT_TYPES, type RouteEventType } from './events';
import styles from './navigation.module.css';

const REPORT_ICON: Record<RouteEventType, typeof AlertTriangle> = {
  police: ShieldAlert,
  accident: Car,
  hazard: AlertTriangle,
  closure: Ban,
  traffic: Turtle,
  zone: AlertTriangle,
};

export interface ReportSheetProps {
  open: boolean;
  onClose: () => void;
  onReport: (type: RouteEventType) => void;
}

/** The report type picker. Big targets, since it is used in motion. */
export function ReportSheet({ open, onClose, onReport }: ReportSheetProps) {
  const { t } = useTranslation();

  return (
    <Sheet open={open} onClose={onClose} title={t('navigation.reportTitle')}>
      <div className={styles.reportGrid}>
        {REPORT_TYPES.map((type) => {
          const Icon = REPORT_ICON[type];
          return (
            <button
              key={type}
              type="button"
              className={styles.reportChoice}
              onClick={() => {
                onReport(type);
                onClose();
              }}
            >
              <span className={styles.reportIcon}>
                <Icon size={26} aria-hidden />
              </span>
              {t(`events.${type}`)}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
