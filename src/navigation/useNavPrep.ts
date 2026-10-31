import { useEffect, useState } from 'react';

import { currentLanguage } from '@/i18n';
import { putRouteBundle, setActiveRouteId, type CachedVoiceClip } from '@/lib/offlineCache';
import { usePreferences } from '@/state/PreferencesProvider';
import { useTrip } from '@/state/TripProvider';
import { ALERT_CLIP_KEYS } from '@/voice/phrase';
import { voiceEngine } from '@/voice/VoiceEngine';

export type NavPrepStatus = 'idle' | 'preparing' | 'ready';

/**
 * Makes the "download the data needed to navigate" step explicit and observable. Once the
 * selected route is computed and the zone layers are in memory, this awaits the voice-clip
 * download/decode and then writes a best-effort offline bundle (route + zones + audio) to
 * IndexedDB. The returned status moves 'idle' -> 'preparing' -> 'ready', which the UI uses to
 * show a "ready for offline driving" affordance.
 */
export function useNavPrep(): { status: NavPrepStatus; ready: boolean } {
  const { route, status: routeStatus, zones, dangerZones } = useTrip();
  const { preferences } = usePreferences();
  const [status, setStatus] = useState<NavPrepStatus>('idle');
  const language = currentLanguage();

  const routeId = route?.id ?? null;
  // Route geometry + maneuvers and the zone layers are the prerequisites; voice is awaited below.
  const dataReady = routeStatus === 'ready' && route !== null && zones !== null;

  useEffect(() => {
    if (!dataReady || !route) {
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('preparing');
    void (async () => {
      let voice: CachedVoiceClip[] = [];
      if (preferences.voiceEnabled && route.requiredVoiceKeys.length > 0) {
        // Alert and status clips are not tied to a manoeuvre, so they are fetched with every
        // route; the set is small and makes the alerts speak in the recorded voice offline.
        const keys = [...new Set([...route.requiredVoiceKeys, ...ALERT_CLIP_KEYS])];
        voice = await voiceEngine.prepare(keys, language, preferences.voiceId);
      }
      // Persist for reload/offline restore. Best-effort: a failed write never blocks readiness.
      await putRouteBundle({
        id: route.id,
        route,
        zones,
        dangerZones,
        voice,
        savedAt: Date.now(),
      });
      setActiveRouteId(route.id);
      if (!cancelled) setStatus('ready');
    })();
    return () => {
      cancelled = true;
    };
    // zones/dangerZones are captured via dataReady flipping true; re-running on their identity
    // would needlessly re-download voice. Route id and voice settings are the meaningful inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, dataReady, preferences.voiceEnabled, preferences.voiceId, language]);

  return { status, ready: status === 'ready' };
}
