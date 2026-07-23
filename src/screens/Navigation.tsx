import { useEffect, useMemo, useState } from 'react';
import type { LatLng } from '@dk/shared';
import {
  ChevronDown,
  ListOrdered,
  OctagonAlert,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { CertaintyIndicator } from '@/components/certainty/CertaintyIndicator';
import { MapCanvas } from '@/components/map/MapCanvas';
import { MapControls } from '@/components/map/MapControls';
import { DEFAULT_CAMERA, type MapCamera } from '@/components/map/types';
import { Badge, Button, Dialog, IconButton, useToast } from '@/components/ui';
import { env } from '@/env';
import { currentLanguage } from '@/i18n';
import { formatArrival, formatDistance, formatDuration } from '@/lib/format';
import { maneuverIcon, maneuverText } from '@/lib/maneuver';
import { referenceBounds, zonesNear } from '@/lib/zoneFilter';
import { EVENT_EMOJI, eventLabel, type RouteEventType } from '@/navigation/events';
import { ReportSheet } from '@/navigation/ReportSheet';
import { StepList } from '@/navigation/StepList';
import { useNavigationRun } from '@/navigation/useNavigationRun';
import { useRouteEventBundle } from '@/navigation/useRouteEventBundle';
import { useRouteEvents } from '@/navigation/useRouteEvents';
import { usePreferences } from '@/state/PreferencesProvider';
import { useTrip } from '@/state/TripProvider';
import { assembleManeuverPhrase, assembleZonePhrase } from '@/voice/phrase';
import { voiceEngine } from '@/voice/VoiceEngine';

import navStyles from '@/navigation/navigation.module.css';
import styles from './screens.module.css';

const SPEEDS = [1, 2, 4, 8];
/** Below this lead distance the ladder starts announcing (first rung is 800 m). */
const ANNOUNCE_FROM_METERS = 850;

export function Navigation() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const simulated = params.get('simulate') === '1';
  const language = currentLanguage();

  const { preferences, update } = usePreferences();
  const { route, zones, dangerZones, destination } = useTrip();
  const run = useNavigationRun(route, simulated);

  const [camera, setCamera] = useState<MapCamera>(DEFAULT_CAMERA);
  const [overview, setOverview] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const { bundle, events, submitReport } = useRouteEventBundle(route);
  const { approaching } = useRouteEvents(events, run.travelledMeters);

  useEffect(() => {
    if (!route) navigate('/', { replace: true });
  }, [route, navigate]);

  useEffect(() => {
    voiceEngine.setEnabled(preferences.voiceEnabled);
  }, [preferences.voiceEnabled]);

  useEffect(() => {
    // Surfacing the assembled phrase makes the voice path verifiable without audio hardware.
    if (env.mock || import.meta.env.DEV) {
      voiceEngine.onAnnounce = (text, channel) => console.info(`[voice:${channel}] ${text}`);
    }
    return () => {
      voiceEngine.reset();
      voiceEngine.onAnnounce = undefined;
    };
  }, []);

  const maneuver = route?.maneuvers[run.currentManeuverIndex] ?? null;
  const next = route?.maneuvers[run.currentManeuverIndex + 1] ?? null;

  // Draw only the zones near the route, so country-wide data stays performant while driving.
  const nearbyZones = useMemo(() => {
    const bounds = referenceBounds([destination?.location ?? null], [route?.geometry ?? null], 0.05);
    return {
      zones: zonesNear(zones?.features ?? [], bounds),
      danger: zonesNear(dangerZones?.features ?? [], bounds),
    };
  }, [zones, dangerZones, destination, route]);

  // The driving zone alert stays glanceable: the name is in the banner, the city and the short
  // reason (the halachic why) go on the secondary line.
  const alertZone = run.zoneAlert?.zone ?? null;
  const zoneReason = alertZone
    ? [alertZone.city, alertZone.description].filter(Boolean).join(' · ')
    : '';

  const instruction = useMemo(
    () => (maneuver ? maneuverText(maneuver, t, language) : ''),
    [maneuver, t, language],
  );

  // A zone warning outranks the driving instruction, on screen and in the ear.
  useEffect(() => {
    if (!run.zoneAlert) return;
    const zoneName = language === 'he' ? run.zoneAlert.zone.nameHe : run.zoneAlert.zone.name;
    voiceEngine.announce({
      id: `zone-${zoneName}`,
      groupId: `zone-${zoneName}`,
      phrase: assembleZonePhrase(zoneName, true, t),
      priority: 'zone',
    });
  }, [run.zoneAlert, language, t]);

  // The spoken instruction is assembled from the manoeuvre fields, independent of the banner,
  // and fires once per ladder rung as the distance counts down.
  useEffect(() => {
    if (!maneuver || run.status !== 'navigating') return;
    if (run.distanceToManeuverMeters > ANNOUNCE_FROM_METERS) return;
    const { phrase, rung } = assembleManeuverPhrase(
      maneuver,
      run.distanceToManeuverMeters,
      language,
      t,
    );
    voiceEngine.announce({
      id: `${maneuver.id}-${rung}`,
      groupId: maneuver.id,
      phrase,
      priority: 'maneuver',
    });
  }, [maneuver, run.distanceToManeuverMeters, run.status, language, t]);

  function patchCamera(patch: Partial<MapCamera>) {
    setCamera((current) => ({ ...current, ...patch }));
    if (patch.follow) setOverview(false);
  }

  function report(type: RouteEventType) {
    const location: LatLng | null = run.position ?? destination?.location ?? null;
    if (!route || !location) return;
    void submitReport({ routeId: route.id, type, location }, run.travelledMeters + 1);
    toast.show(t('navigation.reportSent'), 'success');
  }

  if (!route) return null;

  const Icon = maneuverIcon(maneuver?.action ?? 'continue');
  const zoneActive = run.zoneAlert !== null;
  const speedKmh = Math.round(run.speedMps * 3.6);

  return (
    <div className={styles.navRoot}>
      <button
        type="button"
        className={`${styles.navBanner} ${zoneActive ? styles['navBanner--zone'] : ''}`}
        onClick={() => setStepsOpen(true)}
        aria-haspopup="dialog"
        aria-label={t('navigation.allSteps')}
      >
        <span className={styles.navBannerIcon}>
          {zoneActive ? <OctagonAlert size={44} aria-hidden /> : <Icon size={44} aria-hidden />}
        </span>
        <span className={styles.navBannerText}>
          <span className={styles.navDistance}>
            {formatDistance(
              zoneActive ? run.zoneAlert!.distanceMeters : run.distanceToManeuverMeters,
              language,
            )}
          </span>
          <span className={styles.navInstruction}>
            {zoneActive
              ? t('maneuver.zone_enter', {
                  zone: language === 'he' ? run.zoneAlert!.zone.nameHe : run.zoneAlert!.zone.name,
                })
              : instruction}
          </span>
        </span>
        <ChevronDown size={22} aria-hidden className={styles.navBannerChevron} />
      </button>

      {next && !zoneActive && (
        <div className={styles.navThen}>
          {t('navigation.then')}: {maneuverText(next, t, language)}
        </div>
      )}

      {zoneActive && zoneReason && (
        <div className={`${styles.navThen} ${styles['navThen--zone']}`}>{zoneReason}</div>
      )}

      <div className={styles.navMap}>
        <MapCanvas
          zones={nearbyZones.zones}
          dangerZones={nearbyZones.danger}
          origin={null}
          destination={destination?.location ?? null}
          route={route.geometry}
          vehicle={run.position}
          vehicleHeading={run.heading}
          verifiedClean={route.verifiedClean}
          focusOnVehicle
          disablePoi
          camera={camera}
          traffic={bundle?.traffic ?? []}
          events={events}
        />
        <div className={styles.navStatusStrip}>
          <CertaintyIndicator
            state={route.verifiedClean ? (zoneActive ? 'zoneAhead' : 'verified') : 'unverified'}
            variant="compact"
          />
          <Badge tone="neutral" className={styles.navBadge}>
            {t(`stringency.${preferences.stringency}`)}
          </Badge>
        </div>

        <MapControls
          camera={camera}
          onChange={patchCamera}
          overview={overview}
          onToggleOverview={() => {
            setOverview((value) => !value);
            setCamera((current) => ({ ...current, follow: overview }));
          }}
        />

        {speedKmh > 0 && (
          <div className={navStyles.navSpeedo}>
            <div className={navStyles.speedo}>
              <span className={navStyles.speedoValue}>{speedKmh}</span>
              <span className={navStyles.speedoUnit}>{t('navigation.speedUnit')}</span>
            </div>
          </div>
        )}
      </div>

      {approaching && !zoneActive && (
        <div
          className={`${navStyles.eventAlert} ${
            approaching.event.type === 'closure' || approaching.event.type === 'accident'
              ? navStyles['eventAlert--danger']
              : ''
          }`}
          role="status"
        >
          <span className={navStyles.eventAlertIcon} aria-hidden>
            {EVENT_EMOJI[approaching.event.type]}
          </span>
          <span className={navStyles.eventAlertText}>
            <span className={navStyles.eventAlertLabel}>
              {eventLabel(approaching.event, language, t)}
            </span>
            <span className={navStyles.eventAlertDistance}>
              {formatDistance(Math.max(0, approaching.distanceMeters), language)}
            </span>
          </span>
        </div>
      )}

      {simulated && (
        <div className={styles.simulationBar}>
          <span>{t('navigation.simulationOn')}</span>
          <IconButton
            label={run.paused ? t('navigation.resume') : t('navigation.pause')}
            icon={run.paused ? <Play size={18} /> : <Pause size={18} />}
            onClick={() => run.setPaused(!run.paused)}
          />
          <IconButton
            label={t('common.back')}
            icon={<SkipBack size={18} className={styles.backIcon} />}
            onClick={() => run.jumpToManeuver(run.currentManeuverIndex - 1)}
          />
          <IconButton
            label={t('common.continue')}
            icon={<SkipForward size={18} className={styles.backIcon} />}
            onClick={() => run.jumpToManeuver(run.currentManeuverIndex + 1)}
          />
          <IconButton
            label={t('navigation.restart')}
            icon={<RotateCcw size={18} />}
            onClick={run.restart}
          />
          <span className={styles.simulationSpacer} />
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.quickChip} ${styles.speedChip}`}
              data-selected={run.speed === value}
              aria-pressed={run.speed === value}
              onClick={() => run.setSpeed(value)}
            >
              {value}x
            </button>
          ))}
        </div>
      )}

      <div className={styles.navBottom}>
        <div className={styles.navMetrics}>
          <span className={styles.navMetric}>
            <span className={styles.navMetricValue}>
              {formatDuration(run.durationRemainingSeconds, language)}
            </span>
            <span className={styles.navMetricLabel}>{t('navigation.remaining')}</span>
          </span>
          <span className={styles.navMetric}>
            <span className={styles.navMetricValue}>
              {formatDistance(run.distanceRemainingMeters, language)}
            </span>
            <span className={styles.navMetricLabel}>{t('route.distance')}</span>
          </span>
          <span className={styles.navMetric}>
            <span className={styles.navMetricValue}>
              {formatArrival(run.durationRemainingSeconds, language)}
            </span>
            <span className={styles.navMetricLabel}>{t('navigation.eta')}</span>
          </span>
        </div>
        <IconButton
          label={t('navigation.allSteps')}
          icon={<ListOrdered size={22} />}
          onClick={() => setStepsOpen(true)}
        />
        <IconButton
          label={t('navigation.report')}
          variant="solid"
          icon={<Plus size={22} />}
          onClick={() => setReportOpen(true)}
        />
        <IconButton
          label={preferences.voiceEnabled ? t('navigation.muteVoice') : t('navigation.unmuteVoice')}
          icon={preferences.voiceEnabled ? <Volume2 size={22} /> : <VolumeX size={22} />}
          onClick={() => update({ voiceEnabled: !preferences.voiceEnabled })}
        />
        <IconButton
          label={t('navigation.stop')}
          variant="primary"
          icon={<X size={22} />}
          onClick={() => setConfirmEnd(true)}
        />
      </div>

      <StepList
        open={stepsOpen}
        onClose={() => setStepsOpen(false)}
        route={route}
        currentIndex={run.currentManeuverIndex}
      />
      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} onReport={report} />

      <Dialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title={t('navigation.stopConfirm')}
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirmEnd(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => navigate('/')}>
              {t('navigation.stop')}
            </Button>
          </>
        }
      />

      <Dialog
        open={run.status === 'arrived'}
        onClose={() => navigate('/')}
        title={t('navigation.arrivedTitle')}
        actions={
          <Button size="large" onClick={() => navigate('/')}>
            {t('navigation.finish')}
          </Button>
        }
      >
        <div className={styles.arrivedCard}>
          {route.verifiedClean
            ? t('navigation.arrivedBody')
            : t('navigation.arrivedBodyUnverified')}
        </div>
      </Dialog>
    </div>
  );
}
