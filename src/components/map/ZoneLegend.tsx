import { useId, useState } from 'react';
import type { Stringency } from '@dk/shared';
import { Layers, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';

import styles from './map.module.css';

const LAYERS: Stringency[] = ['basic', 'taharat', 'machmirim'];

/**
 * Explains the three zone colours. On narrow viewports it collapses to a toggle so it never
 * covers the map; on wide viewports the panel stays visible and the toggle is hidden.
 */
export function ZoneLegend({
  className,
  showDanger = false,
}: {
  className?: string;
  /** Adds the danger-zone (Area A) row when danger zones are present on the map. */
  showDanger?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={cn(styles.legendWrap, className)}>
      <IconButton
        label={t('map.legendTitle')}
        variant="solid"
        className={styles.legendToggle}
        icon={<Layers size={20} />}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      />
      <div id={panelId} className={styles.legendPanel} data-open={open} role="note">
        <div className={styles.legendHeader}>
          <span className={styles.legendTitle}>{t('map.legendTitle')}</span>
          <IconButton
            label={t('common.close')}
            variant="plain"
            className={styles.legendClose}
            icon={<X size={16} />}
            onClick={() => setOpen(false)}
          />
        </div>
        {LAYERS.map((layer) => (
          <span key={layer} className={styles.legendRow}>
            <span
              className={cn(styles.legendSwatch, styles[`legendSwatch--${layer}`])}
              aria-hidden
            />
            {t(`map.legend.${layer}`)}
          </span>
        ))}
        {showDanger && (
          <span className={styles.legendRow}>
            <span className={cn(styles.legendSwatch, styles['legendSwatch--danger'])} aria-hidden />
            {t('map.legend.danger')}
          </span>
        )}
      </div>
    </div>
  );
}
