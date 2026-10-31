import { useEffect, useMemo, useRef, useState } from 'react';
import type { LatLng, NavFeedbackRating } from '@dk/shared';
import {
  ArrowUp,
  ChevronDown,
  ListOrdered,
  OctagonAlert,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
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
import { drivingZoom } from '@/components/map/zoom';
import { StatusBanner } from '@/components/status/StatusBanner';
import { api } from '@/api';
import { Badge, Button, Dialog, IconButton, Input, useToast } from '@/components/ui';
import { env } from '@/env';
import { analytics } from '@/lib/analytics';
import { useConnectivity } from '@/lib/useConnectivity';
import { currentLanguage } from '@/i18n';
import { formatArrival, formatDistance, formatDuration } from '@/lib/format';
import { maneuverIcon, maneuverText } from '@/lib/maneuver';
import { useVisibleZones } from '@/lib/useVisibleZones';
import { referenceBounds } from '@/lib/zoneFilter';
import { EVENT_EMOJI, eventLabel, type RouteEventType } from '@/navigation/events';
import { ReportSheet } from '@/navigation/ReportSheet';
import { StepList } from '@/navigation/StepList';
import { AlertThrottle } from '@/navigation/tripwire';
import { useNavigationRun } from '@/navigation/useNavigationRun';
import { useRouteEventBundle } from '@/navigation/useRouteEventBundle';
import { useRouteEvents } from '@/navigation/useRouteEvents';
import { usePreferences } from '@/state/PreferencesProvider';
import { useTrip } from '@/state/TripProvider';
import {
  assembleAlertPhrase,
  assembleManeuverPhrase,
  assembleReroutePhrase,
  assembleZonePhrase,
  type AlertPhraseKind,
} from '@/voice/phrase';
import { voiceEngine } from '@/voice/VoiceEngine';
import { voiceGender, voiceTranslator } from '@/voice/voiceId';

import navStyles from '@/navigation/navigation.module.css';
import styles from './screens.module.css';

const SPEEDS = [1, 2, 4, 8];
/** Below this lead distance the ladder starts announcing (first rung is 800 m). */
const ANNOUNCE_FROM_METERS = 850;
/** In-drive reporting is temporarily hidden. Flip to re-enable the "+" button and its sheet. */
const REPORTING_ENABLED = false;
/** How long overview stays framed before snapping back to follow, while the vehicle is moving. */
const OVERVIEW_AUTO_RETURN_MS = 10_000;
/** Above this speed (~7 km/h) the driver is under way, so overview should not linger. */
const OVERVIEW_MOVING_MPS = 2;
/** Repeat the "you are inside a zone" warning at most this often while it stays true. */
const ZONE_INSIDE_REPEAT_MS = 60_000;
/** Re-announce an approaching zone only after this long, e.g. after leaving and re-approaching. */
const ZONE_AHEAD_REPEAT_MS = 120_000;
/** While off route with no connection, repeat "return to the route" this often. */
const RETURN_TO_ROUTE_REPEAT_MS = 30_000;
/** A GPS loss is announced at most this often, so a flapping signal does not nag. */
const GPS_ALERT_REPEAT_MS = 60_000;

/**
 * Good/bad end-of-trip rating. A thumbs-down reveals an optional free-text field so the driver
 * can say what went wrong. Rating stays lifted in the screen so both the arrival and the early
 * stop dialogs can submit it before leaving.
 */
function FeedbackFields({
  rating,
  onRate,
  text,
  onText,
}: {
  rating: NavFeedbackRating | null;
  onRate: (rating: NavFeedbackRating) => void;
  text: string;
  onText: (text: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.feedback}>
      <span className={styles.feedbackPrompt}>{t('navigation.feedbackPrompt')}</span>
      <div className={styles.feedbackChoices}>
        <button
          type="button"
          className={styles.feedbackChoice}
          data-selected={rating === 'good'}
          aria-pressed={rating === 'good'}
          onClick={() => onRate('good')}
        >
          <ThumbsUp size={24} aria-hidden />
          {t('navigation.feedbackGood')}
        </button>
        <button
          type="button"
          className={styles.feedbackChoice}
          data-selected={rating === 'bad'}
          aria-pressed={rating === 'bad'}
          onClick={() => onRate('bad')}
        >
          <ThumbsDown size={24} aria-hidden />
          {t('navigation.feedbackBad')}
        </button>
      </div>
      {rating === 'bad' && (
        <Input
          value={text}
          onChange={(event) => onText(event.target.value)}
          placeholder={t('navigation.feedbackProblemPlaceholder')}
          autoFocus
        />
      )}
    </div>
  );
}

export function Navigation() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const simulated = params.get('simulate') === '1';
  const language = currentLanguage();

  const { preferences, update } = usePreferences();
  const { route, zones, dangerZones, destination, recomputeFrom, hydrateFromCache } = useTrip();
  // The local tripwire checks the full loaded layers, so it keeps alerting with no connection.
  // Danger zones are included only while the driver asked to avoid them.
  const tripwireZones = useMemo(
    () =>
      zones
        ? {
            zones: zones.features,
            dangerZones: preferences.avoidDangerZones ? dangerZones?.features ?? [] : [],
          }
        : null,
    [zones, dangerZones, preferences.avoidDangerZones],
  );
  const run = useNavigationRun(route, simulated, tripwireZones);
  // Spoken texts follow the voice's gender; the screen keeps using plain `t`.
  const vt = useMemo(
    () => voiceTranslator(t, voiceGender(preferences.voiceId)),
    [t, preferences.voiceId],
  );
  /** Per-situation repeat limits for every spoken alert on this screen. */
  const alertThrottle = useRef(new AlertThrottle());

  /** Speaks a one-clip road or status alert, at most once per `intervalMs` for its key. */
  function speakAlert(
    kind: AlertPhraseKind,
    key: string,
    intervalMs: number,
    options: { limitKmh?: number } = {},
  ) {
    if (!alertThrottle.current.shouldFire(key, intervalMs)) return;
    voiceEngine.announce({
      id: `${key}-${Date.now()}`,
      groupId: `alert-${kind}`,
      phrase: assembleAlertPhrase(kind, vt, options),
      priority: 'zone',
    });
  }
  const online = useConnectivity();
  const [recalculating, setRecalculating] = useState(false);

  const [camera, setCamera] = useState<MapCamera>(DEFAULT_CAMERA);
  const [overview, setOverview] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<NavFeedbackRating | null>(null);
  const [feedbackText, setFeedbackText] = useState('');

  const { bundle, events, submitReport } = useRouteEventBundle(route);
  const { approaching } = useRouteEvents(events, run.travelledMeters);

  // A reload mid-drive loses the in-memory route. Before bouncing home, try to restore the route
  // (and its zones + voice) from the offline cache, so a refresh or a connectivity blip resumes
  // the drive instead of dropping it. Runs once on mount; a restore populates `route` in context.
  useEffect(() => {
    if (route) return;
    let active = true;
    void hydrateFromCache().then((restored) => {
      if (active && !restored) navigate('/', { replace: true });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    voiceEngine.setEnabled(preferences.voiceEnabled);
  }, [preferences.voiceEnabled]);

  // Report a completed drive once, when the run reaches its destination.
  useEffect(() => {
    if (run.status === 'arrived') analytics.event('navigation_arrived');
  }, [run.status]);

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

  // Draw only the zones the driving camera is showing, so country-wide data stays performant while
  // driving and an overview or a pinch out still fills in the zones it uncovers. The route
  // corridor is the fallback frame, used until the map reports its first viewport.
  const fallbackBounds = useMemo(
    () => referenceBounds([destination?.location ?? null], [route?.geometry ?? null], 0.05),
    [destination, route],
  );
  const nearbyZones = useVisibleZones(zones?.features, dangerZones?.features, fallbackBounds);

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

  // While auto zoom is on the driving speed picks the zoom, so entering navigation pulls the
  // camera in from the route overview by itself and eases out again at speed. A deliberate zoom
  // pins it until the driver recentres.
  const drivingCamera: MapCamera = useMemo(
    () => (camera.autoZoom ? { ...camera, zoom: drivingZoom(run.speedMps) } : camera),
    [camera, run.speedMps],
  );

  // A zone warning outranks the driving instruction, on screen and in the ear. Being inside a
  // zone repeats at a steady pace while it stays true; an approach is announced once per
  // approach, so a slow crawl towards a zone does not repeat it on every tick.
  const zoneAlertKey = run.zoneAlert
    ? `${run.zoneAlert.inside ? 'inside' : 'ahead'}:${run.zoneAlert.zone.name}`
    : null;
  useEffect(() => {
    if (!run.zoneAlert || !zoneAlertKey) return;
    const interval = run.zoneAlert.inside ? ZONE_INSIDE_REPEAT_MS : ZONE_AHEAD_REPEAT_MS;
    if (!alertThrottle.current.shouldFire(zoneAlertKey, interval)) return;
    const zoneName = language === 'he' ? run.zoneAlert.zone.nameHe : run.zoneAlert.zone.name;
    voiceEngine.announce({
      id: `${zoneAlertKey}-${Date.now()}`,
      groupId: `zone-${zoneName}`,
      phrase: assembleZonePhrase(zoneName, !run.zoneAlert.inside, vt),
      priority: 'zone',
    });
    // Keyed on the situation, not on the countdown distance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneAlertKey, language, vt]);

  // The spoken instruction is assembled from the manoeuvre fields, independent of the banner,
  // and fires once per ladder rung as the distance counts down.
  useEffect(() => {
    if (!maneuver || run.status !== 'navigating') return;
    if (run.distanceToManeuverMeters > ANNOUNCE_FROM_METERS) return;
    const { phrase, rung } = assembleManeuverPhrase(
      maneuver,
      run.distanceToManeuverMeters,
      language,
      vt,
    );
    voiceEngine.announce({
      id: `${maneuver.id}-${rung}`,
      groupId: maneuver.id,
      phrase,
      priority: 'maneuver',
    });
  }, [maneuver, run.distanceToManeuverMeters, run.status, language, vt]);

  // As soon as the vehicle passes a manoeuvre, flush any instruction still being spoken for a
  // manoeuvre already behind us, so fast progress cannot leave the voice lagging.
  useEffect(() => {
    voiceEngine.dropStale(maneuver?.id ?? null);
  }, [run.currentManeuverIndex, maneuver]);

  // Off-route: online, recompute from the live position and announce it. Offline there is no
  // way to recompute, so the driver is guided back to the route instead (below), and the
  // recompute runs as soon as the connection returns if the vehicle is still off route.
  useEffect(() => {
    if (!run.offRoute || recalculating || !online) return;
    const from = run.position ?? destination?.location ?? null;
    if (!from) return;
    setRecalculating(true);
    voiceEngine.announce({
      id: `reroute-${Date.now()}`,
      groupId: 'reroute',
      phrase: assembleReroutePhrase(vt),
      priority: 'zone',
    });
    void recomputeFrom(from).finally(() => setRecalculating(false));
    // Intentionally keyed only on the off-route flag and connectivity: the guard above prevents
    // re-entry while a recompute is in flight, and a fresh route clears the flag in the run hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.offRoute, online]);

  // Offline and off route: point back to the nearest part of the route and say so, repeating
  // at a steady pace; when the vehicle rejoins, confirm it once.
  const returning = !simulated && run.offRoute && !online && run.rejoin !== null;
  const wasReturning = useRef(false);
  useEffect(() => {
    if (returning) {
      wasReturning.current = true;
      speakAlert('return_to_route', 'return_to_route', RETURN_TO_ROUTE_REPEAT_MS);
      return;
    }
    if (wasReturning.current && !run.offRoute) {
      wasReturning.current = false;
      alertThrottle.current.reset('return_to_route');
      speakAlert('back_on_route', 'back_on_route', 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returning, run.offRoute, run.rejoin?.distanceMeters]);

  // GPS lost and restored, spoken for a real drive only. The restore is said only after a loss.
  const gpsLost = !simulated && run.gpsLost;
  const hadGpsLoss = useRef(false);
  useEffect(() => {
    if (gpsLost) {
      hadGpsLoss.current = true;
      speakAlert('gps_lost', 'gps_lost', GPS_ALERT_REPEAT_MS);
    } else if (hadGpsLoss.current) {
      hadGpsLoss.current = false;
      speakAlert('gps_recovered', 'gps_recovered', 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsLost]);

  // Overview is a glance, not a mode: if the driver frames the whole route while actually under
  // way, snap back to follow after a short beat so guidance resumes on its own. When stopped
  // (speed at/below the threshold) they are likely studying the route, so leave overview in place;
  // this effect re-runs as speed changes, so it arms once they start moving again. Turning overview
  // off (manually or by recentring) drops the timer via the cleanup, avoiding any fight/flicker.
  useEffect(() => {
    if (!overview || run.speedMps <= OVERVIEW_MOVING_MPS) return;
    const timer = setTimeout(() => {
      // Mirror the recenter action: resume following and hand zoom back to the speed-driven camera.
      setOverview(false);
      setCamera((current) => ({ ...current, follow: true, autoZoom: true }));
    }, OVERVIEW_AUTO_RETURN_MS);
    return () => clearTimeout(timer);
  }, [overview, run.speedMps]);

  function patchCamera(patch: Partial<MapCamera>) {
    setCamera((current) => ({ ...current, ...patch }));
    if (patch.follow) setOverview(false);
  }

  // Fire-and-forget so a slow or failing feedback POST can never keep the driver on this screen:
  // the request runs with its own toast, and navigation home happens immediately either way.
  function leaveWithFeedback() {
    if (route && feedbackRating) {
      const text = feedbackRating === 'bad' ? feedbackText.trim() : '';
      analytics.event('feedback_submitted', { rating: feedbackRating });
      void api
        .submitNavFeedback({
          routeId: route.id,
          rating: feedbackRating,
          text: text || undefined,
        })
        .then(() => toast.show(t('navigation.feedbackThanks'), 'success'))
        .catch(() => toast.show(t('navigation.feedbackFailed'), 'danger'));
    }
    navigate('/');
  }

  function closeConfirmEnd() {
    setConfirmEnd(false);
    setFeedbackRating(null);
    setFeedbackText('');
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
          {zoneActive ? (
            <OctagonAlert size={44} aria-hidden />
          ) : returning ? (
            <ArrowUp
              size={44}
              aria-hidden
              style={{ transform: `rotate(${(run.rejoin!.bearingDegrees - run.heading).toFixed(0)}deg)` }}
            />
          ) : (
            <Icon size={44} aria-hidden />
          )}
        </span>
        <span className={styles.navBannerText}>
          <span className={styles.navDistance}>
            {formatDistance(
              zoneActive
                ? run.zoneAlert!.distanceMeters
                : returning
                  ? run.rejoin!.distanceMeters
                  : run.distanceToManeuverMeters,
              language,
            )}
          </span>
          <span className={styles.navInstruction}>
            {zoneActive
              ? t(run.zoneAlert!.inside ? 'navigation.insideZone' : 'maneuver.zone_enter', {
                  zone: language === 'he' ? run.zoneAlert!.zone.nameHe : run.zoneAlert!.zone.name,
                })
              : returning
                ? t('navigation.returnToRoute')
                : recalculating
                  ? t('navigation.recalculating')
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

      {/* Connectivity/GPS status sits right under the instruction card, so a lost fix or dropped
          connection is seen without taking the eyes off the guidance. GPS is only meaningful for
          a real drive, never a simulation. */}
      <StatusBanner
        online={online}
        gpsLost={!simulated && run.gpsLost}
        className={styles.navStatusBanner}
      />

      <div className={`${styles.navMap} dk-no-select`}>
        <MapCanvas
          zones={nearbyZones.zones}
          dangerZones={nearbyZones.danger}
          onVisibleBoundsChange={nearbyZones.onVisibleBoundsChange}
          origin={null}
          destination={destination?.location ?? null}
          route={route.geometry}
          vehicle={run.position}
          vehicleHeading={run.heading}
          verifiedClean={route.verifiedClean}
          focusOnVehicle
          disablePoi
          camera={drivingCamera}
          onCameraChange={patchCamera}
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
          camera={drivingCamera}
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
        {REPORTING_ENABLED && (
          <IconButton
            label={t('navigation.report')}
            variant="solid"
            icon={<Plus size={22} />}
            onClick={() => setReportOpen(true)}
          />
        )}
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
      {REPORTING_ENABLED && (
        <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} onReport={report} />
      )}

      <Dialog
        open={confirmEnd}
        onClose={closeConfirmEnd}
        title={t('navigation.stopConfirm')}
        actions={
          <>
            <Button variant="outline" onClick={closeConfirmEnd}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                analytics.event('navigation_stopped');
                leaveWithFeedback();
              }}
            >
              {t('navigation.stop')}
            </Button>
          </>
        }
      >
        <FeedbackFields
          rating={feedbackRating}
          onRate={setFeedbackRating}
          text={feedbackText}
          onText={setFeedbackText}
        />
      </Dialog>

      <Dialog
        open={run.status === 'arrived'}
        onClose={leaveWithFeedback}
        title={t('navigation.arrivedTitle')}
        actions={
          <Button size="large" onClick={leaveWithFeedback}>
            {t('navigation.finish')}
          </Button>
        }
      >
        <div className={styles.arrivedCard}>
          {route.verifiedClean
            ? t('navigation.arrivedBody')
            : t('navigation.arrivedBodyUnverified')}
        </div>
        <FeedbackFields
          rating={feedbackRating}
          onRate={setFeedbackRating}
          text={feedbackText}
          onText={setFeedbackText}
        />
      </Dialog>
    </div>
  );
}
