import { useId, useState } from 'react';
import type { Stringency } from '@dk/shared';
import { Layers, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';

import styles from './map.module.css';

const LAYERS: Stringency[] = ['basic', 'taharat', 'machmirim'];

/**
 * Explains the zone colours. A small corner button opens the legend as a popover, on every
 * viewport, so it never covers the map until asked for.
 */
export function ZoneLegend({
  className,
  showDanger = false,
  placement = 'down',
}: {
  className?: string;
  /** Adds the danger-zone (Area A) row when danger zones are present on the map. */
  showDanger?: boolean;
  /** Which way the panel opens from the button. */
  placement?: 'up' | 'down';
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    // Map chrome: never selectable, so dragging across the legend still pans the map.
    <div
      className={cn(styles.legendWrap, 'dk-no-select', className)}
      data-placement={placement}
      data-tour="legend"
    >
      <IconButton
        label={t('map.legendTitle')}
        variant="solid"
        size="large"
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
