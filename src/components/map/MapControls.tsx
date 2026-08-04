import { Compass, LocateFixed, Maximize2, Minus, Navigation2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton, Spinner } from '@/components/ui';

import styles from './map.module.css';
import type { MapCamera } from './types';

const MIN_ZOOM = 13;
const MAX_ZOOM = 19;

export interface MapControlsProps {
  camera: MapCamera;
  onChange: (patch: Partial<MapCamera>) => void;
  /** Overview frames the whole route; only shown when `onToggleOverview` is given. */
  overview?: boolean;
  onToggleOverview?: () => void;
  /** Extra recenter behaviour, e.g. re-requesting the device position on the home screen. */
  onRecenter?: () => void;
  locating?: boolean;
  /** The heading-up toggle only makes sense while driving. */
  showHeading?: boolean;
  /** Absolute on the map (driving) by default; false places it in normal flow (home). */
  floating?: boolean;
}

/** The table-stakes map controls, stacked for one-handed reach on the inline-end edge. */
export function MapControls({
  camera,
  onChange,
  overview = false,
  onToggleOverview,
  onRecenter,
  locating = false,
  showHeading = true,
  floating = true,
}: MapControlsProps) {
  const { t } = useTranslation();

  return (
    // Map chrome: never selectable, so a drag that grazes a button still pans the map.
    <div className={`${floating ? styles.controls : styles.controlsStatic} dk-no-select`}>
      <IconButton
        label={t('navigation.zoomIn')}
        variant="solid"
        icon={<Plus size={20} />}
        disabled={camera.zoom >= MAX_ZOOM}
        // A deliberate zoom wins over the automatic one until the driver recentres.
        onClick={() => onChange({ zoom: Math.min(MAX_ZOOM, camera.zoom + 1), autoZoom: false })}
      />
      <IconButton
        label={t('navigation.zoomOut')}
        variant="solid"
        icon={<Minus size={20} />}
        disabled={camera.zoom <= MIN_ZOOM}
        onClick={() => onChange({ zoom: Math.max(MIN_ZOOM, camera.zoom - 1), autoZoom: false })}
      />
      {showHeading && (
        <IconButton
          label={camera.headingUp ? t('navigation.northUp') : t('navigation.headingUp')}
          variant="solid"
          aria-pressed={camera.headingUp}
          icon={camera.headingUp ? <Navigation2 size={20} /> : <Compass size={20} />}
          onClick={() => onChange({ headingUp: !camera.headingUp })}
        />
      )}
      {onToggleOverview && (
        <IconButton
          label={t('navigation.overview')}
          variant={overview ? 'primary' : 'solid'}
          aria-pressed={overview}
          icon={<Maximize2 size={20} />}
          onClick={onToggleOverview}
        />
      )}
      <IconButton
        label={t('navigation.recenter')}
        variant={camera.follow && !overview ? 'primary' : 'solid'}
        className={floating ? undefined : styles.recenterStatic}
        icon={locating ? <Spinner size="small" /> : <LocateFixed size={20} />}
        disabled={locating}
        onClick={() => {
          // Recentring also hands the zoom back to the speed-driven camera.
          onChange({ follow: true, autoZoom: true });
          onRecenter?.();
        }}
      />
    </div>
  );
}
