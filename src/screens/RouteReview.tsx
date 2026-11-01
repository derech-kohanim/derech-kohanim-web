import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlaceCategory, SavedPlace } from '@dk/shared';
import {
  AlertTriangle,
  Briefcase,
  ChevronLeft,
  Flag,
  CheckCircle2,
  Clock,
  Home as HomeIcon,
  MapPin,
  PlayCircle,
  Route as RouteIcon,
  Search,
  Shield,
  Star,
  TimerReset,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { MapCanvas } from '@/components/map/MapCanvas';
import { ZoneInfoSheet } from '@/components/map/ZoneInfoSheet';
import { ZoneLegend } from '@/components/map/ZoneLegend';
import type { SelectedZone } from '@/components/map/types';
import { Button, Dialog, IconButton, ListItem, Sheet, Switch, useToast } from '@/components/ui';
import { currentLanguage } from '@/i18n';
import { analytics } from '@/lib/analytics';
import { formatArrival, formatDistance, formatDuration } from '@/lib/format';
import { isZoneManeuver, maneuverIcon, maneuverText } from '@/lib/maneuver';
import { useVisibleZones } from '@/lib/useVisibleZones';
import { referenceBounds } from '@/lib/zoneFilter';
import { useNavPrep } from '@/navigation/useNavPrep';
import { useTour } from '@/tour/Tour';
import type { ReportContext } from '@/screens/Report';
import { usePreferences } from '@/state/PreferencesProvider';
import { useTrip } from '@/state/TripProvider';
import { useAuth } from '@/state/AuthProvider';
import { distanceMeters } from '@/lib/geo';
import { useRequireAccount } from '@/state/useRequireAccount';
import { voiceEngine } from '@/voice/VoiceEngine';

import styles from './screens.module.css';

/** Above this the avoidance cost stops being a detail and becomes the headline. */
const HEAVY_DETOUR_RATIO = 1.5;

/** Below this delta the avoidance did not meaningfully lengthen the drive. */
const AVOIDANCE_THRESHOLD_SECONDS = 30;

export function RouteReview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { preferences, update } = usePreferences();
  const {
    destination,
    route,
    routes,
    selectRoute,
    unavoidedRoute,
    status,
    errorCode,
    zones,
    dangerZones,
    origin,
    recompute,
  } = useTrip();
  const language = currentLanguage();
  const requireAccount = useRequireAccount();
  const [proceedOpen, setProceedOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const tour = useTour('route', status === 'ready' && route !== null);
  const [showUnavoided, setShowUnavoided] = useState(false);
  const [selectedZone, setSelectedZone] = useState<SelectedZone | null>(null);

  // Keep only the zones the map is showing, so country-wide data never draws hundreds of polygons
  // at once, while panning or zooming out still reveals the zones wherever the user looks. The
  // route corridor is the fallback frame, used until the map reports its first viewport.
  const fallbackBounds = useMemo(
    () =>
      referenceBounds(
        [origin, destination?.location ?? null],
        [route?.geometry ?? null, unavoidedRoute?.geometry ?? null],
        0.05,
      ),
    [origin, destination, route, unavoidedRoute],
  );
  const nearbyZones = useVisibleZones(zones?.features, dangerZones?.features, fallbackBounds);

  useEffect(() => {
    if (!destination) navigate('/', { replace: true });
  }, [destination, navigate]);

  // The saved place this destination already is, if any: same id, or within 50 m of it.
  const { user } = useAuth();
  const [savedMatch, setSavedMatch] = useState<SavedPlace | null>(null);
  useEffect(() => {
    if (!user || !destination) {
      setSavedMatch(null);
      return;
    }
    let cancelled = false;
    void api
      .savedPlaces()
      .then((places) => {
        if (cancelled) return;
        setSavedMatch(
          places.find(
            (place) =>
              place.id === destination.id ||
              distanceMeters(place.location, destination.location) <= 50,
          ) ?? null,
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, destination]);

  async function removeFavorite() {
    if (!savedMatch) return;
    try {
      await api.removeSavedPlace(savedMatch.id);
      setSavedMatch(null);
      toast.show(t('saved.removedToast'), 'info');
    } catch {
      toast.show(t('errors.generic'), 'danger');
    }
  }

  async function saveFavorite(category: PlaceCategory) {
    if (!destination) return;
    try {
      // Home and Work are single slots: replace any existing one so there is never a duplicate.
      if (category === 'home' || category === 'work') {
        const saved = await api.savedPlaces();
        const existing = saved.find((place) => place.category === category);
        if (existing) await api.removeSavedPlace(existing.id);
      }
      const label =
        category === 'home'
          ? t('category.home')
          : category === 'work'
            ? t('category.work')
            : destination.title;
      const created = await api.addSavedPlace({
        label,
        category,
        location: destination.location,
        address: destination.subtitle,
      });
      setSavedMatch(created);
      toast.show(t('saved.savedToast'), 'success');
    } catch {
      toast.show(t('errors.generic'), 'danger');
    } finally {
      setSaveOpen(false);
    }
  }

  // The nav-data download (route + zones + voice clips) is made explicit and awaited here, so we
  // can surface a clear "ready for offline driving" state while the driver is still parked.
  const prep = useNavPrep();
  const readyToastShown = useRef(false);
  useEffect(() => {
    if (prep.ready && !readyToastShown.current) {
      readyToastShown.current = true;
      toast.show(t('offline.ready'), 'success');
    }
  }, [prep.ready, toast, t]);

  function start(simulated: boolean) {
    voiceEngine.unlock();
    analytics.event('navigation_started', { simulated });
    navigate(simulated ? '/navigate?simulate=1' : '/navigate');
  }

  // Real avoidance cost is only measurable against the plain zone-crossing route: the clean
  // route's time minus the unavoided route's time. Never derived from detourRatio, which
  // conflates road-vs-crow-flies distance and route choice with the cost of zone avoidance.
  const avoidanceExtraSeconds =
    route && unavoidedRoute ? route.durationSeconds - unavoidedRoute.durationSeconds : null;
  const heavyDetour =
    route !== null &&
    unavoidedRoute !== null &&
    route.durationSeconds >= unavoidedRoute.durationSeconds * HEAVY_DETOUR_RATIO;

  // The fastest alternative anchors the neutral "+X" relative-time badges on the other cards.
  const fastestSeconds = routes.length
    ? Math.min(...routes.map((alt) => alt.durationSeconds))
    : 0;

  return (
    <div className={styles.routeRoot}>
      <ScreenHeader
        title={destination?.title ?? t('route.title')}
        backTo="/"
        actions={
          destination ? (
            <>
            <IconButton
              data-tour="report"
              label={t('report.routeAction')}
              icon={<Flag size={22} />}
              onClick={() =>
                navigate('/report', { state: { kind: 'route', routeId: route?.id } satisfies ReportContext })
              }
            />
            <IconButton
              data-tour="save"
              label={savedMatch ? t('route.savedFavorite') : t('route.addFavorite')}
              aria-pressed={savedMatch !== null}
              icon={
                <Star
                  size={22}
                  fill={savedMatch ? 'currentColor' : 'none'}
                  className={savedMatch ? styles.starSaved : undefined}
                />
              }
              onClick={() =>
                savedMatch ? void removeFavorite() : requireAccount(() => setSaveOpen(true))
              }
            />
            </>
          ) : undefined
        }
      />

      <div className={`${styles.routeMap} dk-no-select`}>
        <MapCanvas
          zones={nearbyZones.zones}
          dangerZones={nearbyZones.danger}
          onZoneSelect={setSelectedZone}
          onVisibleBoundsChange={nearbyZones.onVisibleBoundsChange}
          origin={origin}
          destination={destination?.location ?? null}
          // Only draw a line for a settled route. While computing (the dialog is up) or idle,
          // suppress it so a previous route never lingers under the new compute.
          route={status === 'ready' ? route?.geometry ?? null : null}
          // The unselected alternatives, faded beneath the highlighted selected route.
          alternativeRoutes={
            status === 'ready'
              ? routes.filter((alt) => alt.id !== route?.id).map((alt) => alt.geometry)
              : []
          }
          // The plain unavoided route, shown only when the comparison toggle is on.
          unavoidedRoute={status === 'ready' && showUnavoided ? unavoidedRoute?.geometry ?? null : null}
          verifiedClean={route?.verifiedClean ?? true}
        />
        {(nearbyZones.zones.length > 0 || nearbyZones.danger.length > 0) && (
          <ZoneLegend className={styles.routeLegend} showDanger={nearbyZones.danger.length > 0} />
        )}
      </div>

      <ZoneInfoSheet selection={selectedZone} onClose={() => setSelectedZone(null)} />

      <div className={styles.routePanel}>
        {/* The compute step reports through the blocking ComputingDialog, so the panel stays
            empty while computing rather than showing a second, inline spinner. */}
        {status === 'error' && (
          <div className={styles.failureCard}>
            <h2 className={styles.failureTitle}>
              <AlertTriangle size={22} aria-hidden />
              {t('route.error')}
            </h2>
            <p className={styles.failureOption}>
              {errorCode ? t(`errors.${errorCode}`) : t('errors.generic')}
            </p>
            <Button onClick={() => void recompute()}>{t('common.retry')}</Button>
          </div>
        )}

        {status === 'ready' && route && (
          <>
            {/* Every route this app offers is verified, so only the exception is announced. */}
            {!route.verifiedClean && (
              <>
                <div className={styles.failureNotice} role="alert">
                  <span className={styles.failureNoticeIcon}>
                    <AlertTriangle size={18} aria-hidden />
                  </span>
                  <span className={styles.failureNoticeText}>
                    <strong>{t('route.failedTitle')}</strong>
                    <span>
                      {t('route.failedBody', {
                        zone:
                          route.maneuvers.find((maneuver) => maneuver.zone)?.zone?.[
                            language === 'he' ? 'nameHe' : 'name'
                          ] ?? t('map.zones'),
                      })}
                    </span>
                  </span>
                </div>

                <section className={styles.actionSection}>
                  <h2 className={styles.actionSectionTitle}>{t('route.failedActionsTitle')}</h2>
                  <div className={styles.actionList} data-tour="noClean">
                    <button type="button" className={styles.actionRow} onClick={() => navigate('/')}>
                      <span className={styles.actionChip}>
                        <Search size={18} aria-hidden />
                      </span>
                      <span className={styles.actionText}>{t('route.failedOptionDestination')}</span>
                      <ChevronLeft size={16} className={styles.actionChevron} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={styles.actionRow}
                      onClick={() => navigate('/settings/avoidance')}
                    >
                      <span className={styles.actionChip}>
                        <Shield size={18} aria-hidden />
                      </span>
                      <span className={styles.actionText}>
                        {t('route.failedOptionStringency')}
                        <span className={styles.actionSubtitle}>
                          {t('route.currentLevel', {
                            level: t(`stringency.${preferences.stringency}`),
                          })}
                        </span>
                      </span>
                      <ChevronLeft size={16} className={styles.actionChevron} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={styles.actionRow}
                      onClick={() => setProceedOpen(true)}
                    >
                      <span className={styles.actionChip} data-tone="danger">
                        <AlertTriangle size={18} aria-hidden />
                      </span>
                      <span className={styles.actionText}>
                        {t('route.failedOptionProceed')}
                        <span className={styles.actionSubtitle}>{t('route.atOwnRisk')}</span>
                      </span>
                      <ChevronLeft size={16} className={styles.actionChevron} aria-hidden />
                    </button>
                  </div>
                </section>
              </>
            )}

            {routes.length > 1 && (
              <div
                className={styles.altList}
                data-tour="alternatives"
                role="radiogroup"
                aria-label={t('route.alternativesTitle')}
              >
                {routes.map((alt) => {
                  const selected = alt.id === route.id;
                  // Difference between alternatives is route CHOICE, not avoidance: a neutral
                  // "+X" versus the fastest, or "fastest" for the quickest one.
                  const delta = alt.durationSeconds - fastestSeconds;
                  return (
                    <button
                      key={alt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      data-selected={selected}
                      className={styles.altCard}
                      onClick={() => selectRoute(alt.id)}
                    >
                      <span className={styles.altTop}>
                        <span className={styles.altLabel}>
                          {delta <= AVOIDANCE_THRESHOLD_SECONDS
                            ? t('route.altFastest')
                            : t('route.altSlower', {
                                time: formatDuration(delta, language),
                              })}
                        </span>
                      </span>
                      <span className={styles.altMetrics}>
                        <span className={styles.altDuration}>
                          {formatDuration(alt.durationSeconds, language)}
                        </span>
                        <span aria-hidden>·</span>
                        <span>{formatDistance(alt.distanceMeters, language)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className={styles.metrics}>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>{t('route.duration')}</span>
                <span className={styles.metricValue}>
                  {formatDuration(route.durationSeconds, language)}
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>{t('route.distance')}</span>
                <span className={styles.metricValue}>
                  {formatDistance(route.distanceMeters, language)}
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>{t('route.arrival')}</span>
                <span className={styles.metricValue}>
                  {formatArrival(route.durationSeconds, language)}
                </span>
              </div>
            </div>

            {/* Shown only when we can actually measure avoidance cost, i.e. an unavoided route
                exists. Otherwise avoidance did not change the outcome and there is no cost line. */}
            {avoidanceExtraSeconds !== null && (
              <p className={`${styles.detour} ${heavyDetour ? styles['detour--warning'] : ''}`}>
                <TimerReset size={18} aria-hidden />
                {avoidanceExtraSeconds > AVOIDANCE_THRESHOLD_SECONDS
                  ? t('route.detourCost', {
                      time: formatDuration(avoidanceExtraSeconds, language),
                    })
                  : t('route.detourNone')}
              </p>
            )}

            {/* Flipping this re-fetches the route, so the ETA above is always the server time. */}
            <div className={styles.routeOptions} data-tour="options">
            <Switch
              className={styles.trafficToggle}
              checked={preferences.trafficAware}
              onCheckedChange={(trafficAware) => update({ trafficAware })}
              label={t('route.trafficToggle')}
            />

            {/* Toll avoidance is a routing constraint, so flipping it recomputes the plan. */}
            <Switch
              className={styles.trafficToggle}
              checked={preferences.avoidTolls}
              onCheckedChange={(avoidTolls) => update({ avoidTolls })}
              label={t('route.tollToggle')}
            />
            </div>

            {/* Danger-zone (Area A) avoidance, on by default. Also recomputes the plan. */}
            <Switch
              className={styles.trafficToggle}
              checked={preferences.avoidDangerZones}
              onCheckedChange={(avoidDangerZones) => update({ avoidDangerZones })}
              label={t('route.dangerToggle')}
            />

            {/* Only offered when avoidance actually changed the outcome. */}
            {unavoidedRoute && (
              <>
                <Switch
                  className={styles.trafficToggle}
                  checked={showUnavoided}
                  onCheckedChange={setShowUnavoided}
                  label={t('route.showUnavoided')}
                />
                {showUnavoided && (
                  <p className={styles.unavoidedNote}>
                    <AlertTriangle size={18} aria-hidden />
                    {t('route.unavoidedWarning')}
                  </p>
                )}
              </>
            )}

            <div className={styles.routeActions}>
            {route.verifiedClean && (
              <Button
                size="large"
                className={styles.routeActionMain}
                onClick={() => start(false)}
                iconStart={
                  prep.ready ? <CheckCircle2 size={20} aria-label={t('offline.ready')} /> : undefined
                }
              >
                {t('route.start')}
              </Button>
            )}
            <Button
              variant="outline"
              size="large"
              className={route.verifiedClean ? undefined : styles.routeActionMain}
              iconStart={<PlayCircle size={20} aria-hidden />}
              data-tour="simulate"
              onClick={() => start(true)}
            >
              {t('route.simulate')}
            </Button>
            </div>

            <h2 className={styles.sectionTitle}>{t('route.maneuvers')}</h2>
            <ol className={styles.maneuverList}>
              {route.maneuvers.map((maneuver) => {
                const Icon = maneuverIcon(maneuver.action);
                const zone = isZoneManeuver(maneuver.action);
                // For a zone step, surface WHY: the city and the halachic explanation (data).
                const zoneReason = maneuver.zone
                  ? [maneuver.zone.city, maneuver.zone.description].filter(Boolean).join(' · ')
                  : '';
                return (
                  <li
                    key={maneuver.id}
                    className={`${styles.maneuver} ${zone ? styles['maneuver--zone'] : ''}`}
                  >
                    <Icon size={20} className={styles.maneuverIcon} aria-hidden />
                    <span className={styles.maneuverText}>
                      {maneuverText(maneuver, t, language)}
                      {zone && zoneReason && (
                        <span className={styles.maneuverReason}>{zoneReason}</span>
                      )}
                    </span>
                    {maneuver.distanceMeters > 0 && (
                      <span className={styles.maneuverDistance}>
                        {formatDistance(maneuver.distanceMeters, language)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>

            <p className={styles.attribution}>
              <RouteIcon size={12} aria-hidden style={{ display: 'inline' }} />{' '}
              {t('route.attribution', { attribution: route.attribution })}
            </p>
            <p className={styles.attribution}>
              <Clock size={12} aria-hidden style={{ display: 'inline' }} />{' '}
              {t(`stringency.${preferences.stringency}`)}
            </p>
          </>
        )}
      </div>

      {tour}
      <Dialog
        open={proceedOpen}
        onClose={() => setProceedOpen(false)}
        title={t('route.proceedTitle')}
        actions={
          <>
            <Button variant="outline" onClick={() => setProceedOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setProceedOpen(false);
                analytics.event('unverified_route_started', {});
                start(false);
              }}
            >
              {t('route.proceedConfirm')}
            </Button>
          </>
        }
      >
        <p className={styles.dialogBody}>{t('route.proceedBody')}</p>
      </Dialog>

      <Sheet open={saveOpen} onClose={() => setSaveOpen(false)} title={t('route.saveTitle')}>
        <ListItem
          leading={<HomeIcon size={20} aria-hidden />}
          title={t('category.home')}
          onClick={() => void saveFavorite('home')}
        />
        <ListItem
          leading={<Briefcase size={20} aria-hidden />}
          title={t('category.work')}
          onClick={() => void saveFavorite('work')}
        />
        <ListItem
          leading={<MapPin size={20} aria-hidden />}
          title={t('category.other')}
          subtitle={destination?.title}
          onClick={() => void saveFavorite('other')}
        />
      </Sheet>
    </div>
  );
}
