import type { Stringency } from '@dk/shared';
import { Flag, MapPin, ShieldAlert, Signpost, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Sheet } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ReportContext } from '@/screens/Report';

import type { SelectedZone } from './types';
import styles from './zoneInfo.module.css';

const LAYER_CHIP: Record<Stringency, string> = {
  basic: styles['layerChip--basic'],
  taharat: styles['layerChip--taharat'],
  machmirim: styles['layerChip--machmirim'],
};

/**
 * The card shown when a zone polygon is tapped. Zone name, city, street, description and the
 * layer are DATA from the server and are shown verbatim, never translated. Only the field
 * labels come from i18n.
 */
export function ZoneInfoSheet({
  selection,
  onClose,
}: {
  selection: SelectedZone | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (!selection) return null;

  const danger = selection.kind === 'danger';
  const { properties } = selection.feature;
  const title = properties.name;
  const city = properties.city;
  const description = properties.description;
  const street = selection.kind === 'stringency' ? selection.feature.properties.street : null;
  const stringency = selection.kind === 'stringency' ? selection.feature.properties.stringency : null;

  return (
    <Sheet open onClose={onClose} title={title}>
      <div className={styles.root}>
        <div className={styles.chips}>
          {danger ? (
            <span className={cn(styles.layerChip, styles['layerChip--danger'])}>
              <TriangleAlert size={14} aria-hidden />
              {t('zoneInfo.dangerLayer')}
            </span>
          ) : (
            stringency && (
              <span className={cn(styles.layerChip, LAYER_CHIP[stringency])}>
                <ShieldAlert size={14} aria-hidden />
                {t(`stringency.${stringency}`)}
              </span>
            )
          )}
        </div>

        {(city || street) && (
          <div className={styles.meta}>
            {city && (
              <span className={styles.metaRow}>
                <MapPin size={16} aria-hidden className={styles.metaIcon} />
                {city}
              </span>
            )}
            {street && (
              <span className={styles.metaRow}>
                <Signpost size={16} aria-hidden className={styles.metaIcon} />
                {street}
              </span>
            )}
          </div>
        )}

        <div className={styles.section}>
          <span className={styles.sectionTitle}>{t('zoneInfo.why')}</span>
          <p className={styles.description}>{description || t('zoneInfo.noDescription')}</p>
        </div>

        <button
          type="button"
          className={styles.reportLink}
          onClick={() => {
            onClose();
            const ring = selection.feature.geometry.coordinates[0] ?? [];
            const lng = ring.reduce((sum, p) => sum + p[0], 0) / (ring.length || 1);
            const lat = ring.reduce((sum, p) => sum + p[1], 0) / (ring.length || 1);
            navigate('/report', {
              state: {
                kind: 'data',
                zoneId: properties.id,
                zoneName: title,
                location: ring.length ? { lat, lng } : undefined,
              } satisfies ReportContext,
            });
          }}
        >
          <Flag size={16} aria-hidden />
          {t('report.zoneAction')}
        </button>
      </div>
    </Sheet>
  );
}
