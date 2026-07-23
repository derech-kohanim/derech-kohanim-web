import { useEffect, useMemo, useState } from 'react';
import type { SavedPlace } from '@dk/shared';
import { Bookmark, Briefcase, Home as HomeIcon, Settings2, Shield, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api';
import { MapCanvas } from '@/components/map/MapCanvas';
import { MapControls } from '@/components/map/MapControls';
import { ZoneInfoSheet } from '@/components/map/ZoneInfoSheet';
import { ZoneLegend } from '@/components/map/ZoneLegend';
import type { MapCamera, SelectedZone } from '@/components/map/types';
import { referenceBounds, zonesNear } from '@/lib/zoneFilter';
import { ProfileButton } from '@/components/profile/ProfileButton';
import { DestinationSearch } from '@/components/search/DestinationSearch';
import { IconButton, useToast } from '@/components/ui';
import { env } from '@/env';
import { useTrip, type Destination } from '@/state/TripProvider';
import { usePreferences } from '@/state/PreferencesProvider';

import styles from './screens.module.css';

const SAVED_ICON = { home: HomeIcon, work: Briefcase } as const;
/** Home is a planning view: north up, no vehicle to follow. */
const HOME_CAMERA: MapCamera = { zoom: 15, headingUp: false, follow: true };

export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { preferences } = usePreferences();
  const { origin, zones, dangerZones, compute, locate, locating, clear } = useTrip();
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [camera, setCamera] = useState<MapCamera>(HOME_CAMERA);
  const [selectedZone, setSelectedZone] = useState<SelectedZone | null>(null);

  // Only the zones near the planning view: with the data covering the whole country this keeps
  // framing anchored on the current area and avoids drawing hundreds of far-away polygons.
  const nearbyZones = useMemo(() => {
    const bounds = referenceBounds([origin], [], 0.12);
    return {
      zones: zonesNear(zones?.features ?? [], bounds),
      danger: zonesNear(dangerZones?.features ?? [], bounds),
    };
  }, [zones, dangerZones, origin]);

  // Landing on the planning screen resets any prior route, so the next compute starts clean and
  // no stale line survives a cancel -> back -> recompute.
  useEffect(() => {
    clear();
  }, [clear]);

  useEffect(() => {
    void api
      .savedPlaces()
      .then(setSaved)
      .catch(() => undefined);
  }, []);

  function go(destination: Destination) {
    void compute(destination);
    navigate('/route');
  }

  async function recenter() {
    const here = await locate();
    if (!here) {
      toast.show(t('home.locationDenied'), 'warning');
      return;
    }
    setCamera((current) => ({ ...current, zoom: 16, follow: true }));
  }

  return (
    <div className={styles.homeRoot}>
      <div className={styles.mapLayer}>
        <MapCanvas
          zones={nearbyZones.zones}
          dangerZones={nearbyZones.danger}
          onZoneSelect={setSelectedZone}
          origin={origin}
          center={origin}
          camera={camera}
        />
      </div>

      <ZoneInfoSheet selection={selectedZone} onClose={() => setSelectedZone(null)} />

      <div className={styles.homeOverlay}>
        <div className={styles.homeTopBar}>
          <div className={styles.homeSearchWrap}>
            <DestinationSearch onSelect={go} near={origin} />
          </div>
          {/* Reading inline-end edge inward: profile/login (outermost, flush to the edge) then
              settings. In source order that is settings first, profile last. */}
          <div className={styles.homeTopActions}>
            <IconButton
              label={t('common.settings')}
              variant="solid"
              size="large"
              icon={<Settings2 size={22} />}
              onClick={() => navigate('/settings')}
            />
            <ProfileButton />
          </div>
        </div>

        <div className={styles.homeBottom}>
          <MapControls
            camera={camera}
            onChange={(patch) => setCamera((current) => ({ ...current, ...patch }))}
            onRecenter={() => void recenter()}
            locating={locating}
            showHeading={false}
            floating={false}
          />
          {(nearbyZones.zones.length > 0 || nearbyZones.danger.length > 0) && (
            <ZoneLegend className={styles.homeLegend} showDanger={nearbyZones.danger.length > 0} />
          )}
          {env.mock && (
            <span className={styles.mockBanner}>
              <Bookmark size={14} aria-hidden />
              {t('settings.mockBanner')}
            </span>
          )}
          <div className={styles.quickRow}>
            {saved.map((place) => {
              const Icon = SAVED_ICON[place.category as keyof typeof SAVED_ICON] ?? Star;
              return (
                <button
                  key={place.id}
                  type="button"
                  className={styles.quickChip}
                  onClick={() =>
                    go({
                      id: place.id,
                      title: place.label,
                      subtitle: place.address,
                      location: place.location,
                    })
                  }
                >
                  <Icon size={18} aria-hidden />
                  {place.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className={styles.stringencyPill}
            data-stringency={preferences.stringency}
            onClick={() => navigate('/settings')}
          >
            <Shield size={18} aria-hidden />
            {t(`stringency.${preferences.stringency}`)}
          </button>
        </div>
      </div>
    </div>
  );
}
