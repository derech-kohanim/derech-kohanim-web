import { useEffect, useState } from 'react';
import type { PlaceCategory } from '@dk/shared';
import {
  AlertTriangle,
  Briefcase,
  Clock,
  Home as HomeIcon,
  MapPin,
  PlayCircle,
  Route as RouteIcon,
  ShieldCheck,
  Star,
  TimerReset,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api';
import { CertaintyIndicator } from '@/components/certainty/CertaintyIndicator';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { MapCanvas } from '@/components/map/MapCanvas';
import { ZoneLegend } from '@/components/map/ZoneLegend';
import { Badge, Button, IconButton, ListItem, Sheet, Switch, useToast } from '@/components/ui';
import { currentLanguage } from '@/i18n';
import { formatArrival, formatDistance, formatDuration } from '@/lib/format';
import { isZoneManeuver, maneuverIcon, maneuverText } from '@/lib/maneuver';
import { usePreferences } from '@/state/PreferencesProvider';
import { useTrip } from '@/state/TripProvider';
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
  const { destination, route, routes, selectRoute, unavoidedRoute, status, errorCode, zones, origin, recompute } =
    useTrip();
  const language = currentLanguage();
  const [saveOpen, setSaveOpen] = useState(false);
  const [showUnavoided, setShowUnavoided] = useState(false);

  useEffect(() => {
    if (!destination) navigate('/', { replace: true });
  }, [destination, navigate]);

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
      await api.addSavedPlace({
        label,
        category,
        location: destination.location,
        address: destination.subtitle,
      });
      toast.show(t('saved.savedToast'), 'success');
    } catch {
      toast.show(t('errors.generic'), 'danger');
    } finally {
      setSaveOpen(false);
    }
  }

  // The clip list for this route is known now, so it loads while the driver is still parked.
  useEffect(() => {
    if (!route || !preferences.voiceEnabled) return;
    void voiceEngine.preload(route.requiredVoiceKeys, language, preferences.voiceId);
  }, [route, preferences.voiceEnabled, preferences.voiceId, language]);

  function start(simulated: boolean) {
    voiceEngine.unlock();
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
            <IconButton
              label={t('route.addFavorite')}
              icon={<Star size={22} />}
              onClick={() => setSaveOpen(true)}
            />
          ) : undefined
        }
      />

      <div className={styles.routeMap}>
        <MapCanvas
          zones={zones?.features ?? []}
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
        {zones && zones.features.length > 0 && <ZoneLegend className={styles.routeLegend} />}
      </div>

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
            <CertaintyIndicator state={route.verifiedClean ? 'verified' : 'unverified'} />

            {!route.verifiedClean && (
              <div className={styles.failureCard}>
                <h2 className={styles.failureTitle}>
                  <AlertTriangle size={22} aria-hidden />
                  {t('route.failedTitle')}
                </h2>
                <p className={styles.failureOption}>
                  {t('route.failedBody', {
                    zone:
                      route.maneuvers.find((maneuver) => maneuver.zone)?.zone?.[
                        language === 'he' ? 'nameHe' : 'name'
                      ] ?? t('map.zones'),
                  })}
                </p>
                <p className={styles.failureOption}>{t('route.failedOptionDestination')}</p>
                <p className={styles.failureOption}>{t('route.failedOptionStringency')}</p>
                <p className={styles.failureOption}>{t('route.failedOptionProceed')}</p>
                <div className={styles.row}>
                  <Button onClick={() => navigate('/')}>{t('route.changeDestination')}</Button>
                  <Button variant="outline" onClick={() => navigate('/settings')}>
                    {t('stringency.label')}
                  </Button>
                </div>
              </div>
            )}

            {routes.length > 1 && (
              <div
                className={styles.altList}
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
                        {alt.verifiedClean && (
                          <Badge tone="success" icon={<ShieldCheck size={14} aria-hidden />}>
                            {t('route.verifiedClean')}
                          </Badge>
                        )}
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
                <span className={styles.metricValue}>
                  {formatDuration(route.durationSeconds, language)}
                </span>
                <span className={styles.metricLabel}>{t('route.duration')}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricValue}>
                  {formatDistance(route.distanceMeters, language)}
                </span>
                <span className={styles.metricLabel}>{t('route.distance')}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricValue}>
                  {formatArrival(route.durationSeconds, language)}
                </span>
                <span className={styles.metricLabel}>{t('route.arrival')}</span>
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

            {route.verifiedClean && (
              <Button size="large" block onClick={() => start(false)}>
                {t('route.start')}
              </Button>
            )}
            <Button
              variant="outline"
              size="large"
              block
              iconStart={<PlayCircle size={20} aria-hidden />}
              onClick={() => start(true)}
            >
              {t('route.simulate')}
            </Button>

            <h2 className={styles.sectionTitle}>{t('route.maneuvers')}</h2>
            <ol className={styles.maneuverList}>
              {route.maneuvers.map((maneuver) => {
                const Icon = maneuverIcon(maneuver.action);
                const zone = isZoneManeuver(maneuver.action);
                return (
                  <li
                    key={maneuver.id}
                    className={`${styles.maneuver} ${zone ? styles['maneuver--zone'] : ''}`}
                  >
                    <Icon size={20} className={styles.maneuverIcon} aria-hidden />
                    <span className={styles.maneuverText}>
                      {maneuverText(maneuver, t, language)}
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
