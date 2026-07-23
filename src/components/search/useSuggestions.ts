import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LatLng, PlaceSuggestion, RecentPlace, SavedPlace } from '@dk/shared';

import { api } from '@/api';
import { currentLanguage } from '@/i18n';
import { formatCoordinates, parseCoordinates } from '@/lib/coordinates';
import { distanceMeters } from '@/lib/geo';
import { matchRanges } from '@/lib/highlight';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

export type SuggestionSection = 'coordinates' | 'saved' | 'recent' | 'results';

export interface SuggestionRow {
  key: string;
  section: SuggestionSection;
  suggestion: PlaceSuggestion;
}

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;
const LOCAL_LIMIT = 4;

function savedToSuggestion(place: SavedPlace, near: LatLng | undefined, query: string): PlaceSuggestion {
  return {
    id: place.id,
    title: place.label,
    subtitle: place.address,
    category: place.category,
    kind: 'saved',
    location: place.location,
    externalId: null,
    distanceMeters: near ? Math.round(distanceMeters(near, place.location)) : null,
    matchedRanges: query ? matchRanges(place.label, query) : [],
  };
}

function recentToSuggestion(
  place: RecentPlace,
  near: LatLng | undefined,
  query: string,
): PlaceSuggestion {
  return {
    id: place.id,
    title: place.title,
    subtitle: place.subtitle,
    category: 'other',
    kind: 'recent',
    location: place.location,
    externalId: null,
    distanceMeters: near ? Math.round(distanceMeters(near, place.location)) : null,
    matchedRanges: query ? matchRanges(place.title, query) : [],
  };
}

function localMatches(title: string, subtitle: string | null, query: string): boolean {
  if (!query) return true;
  return (
    matchRanges(title, query).length > 0 || (subtitle ? matchRanges(subtitle, query).length > 0 : false)
  );
}

export interface UseSuggestionsResult {
  rows: SuggestionRow[];
  loading: boolean;
  error: string | null;
  /** True when the query is long enough but produced nothing anywhere. */
  emptyResult: boolean;
  /** First-class slots, surfaced as shortcuts above the list. Null until set. */
  home: SavedPlace | null;
  work: SavedPlace | null;
  retry: () => void;
}

/**
 * Saved and recent places resolve from local state with no network wait; only the free text
 * search is debounced and aborted. Both paths produce the same row shape, so the list looks
 * and behaves identically whatever the source.
 */
export function useSuggestions(query: string, near?: LatLng): UseSuggestionsResult {
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);

  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [recent, setRecent] = useState<RecentPlace[]>([]);
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [resultsFor, setResultsFor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    void api.savedPlaces().then(setSaved).catch(() => undefined);
    void api.recentPlaces().then(setRecent).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (debounced.length < MIN_QUERY) {
      controller.current?.abort();
      setResults([]);
      setResultsFor('');
      setLoading(false);
      setError(null);
      return;
    }

    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;

    setLoading(true);
    setError(null);

    void api
      .searchPlaces(
        { query: debounced, language: currentLanguage(), near, limit: 8 },
        { signal: next.signal },
      )
      .then((response) => {
        if (next.signal.aborted) return;
        setResults(response.suggestions);
        setResultsFor(response.query);
        setLoading(false);
      })
      .catch((cause: Error & { code?: string }) => {
        if (next.signal.aborted || cause.name === 'AbortError') return;
        setResults([]);
        setError(cause.code ?? 'generic');
        setLoading(false);
      });

    return () => next.abort();
    // `near` is intentionally not a dependency: a moving position must not restart the search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const rows = useMemo<SuggestionRow[]>(() => {
    const list: SuggestionRow[] = [];

    const coordinate = parseCoordinates(trimmed);
    if (coordinate) {
      list.push({
        key: 'coordinates',
        section: 'coordinates',
        suggestion: {
          id: `coord:${coordinate.lat},${coordinate.lng}`,
          title: formatCoordinates(coordinate),
          subtitle: null,
          category: 'coordinates',
          kind: 'coordinates',
          location: coordinate,
          externalId: null,
          distanceMeters: near ? Math.round(distanceMeters(near, coordinate)) : null,
          matchedRanges: [],
        },
      });
    }

    const localIds = new Set<string>();

    for (const place of saved) {
      // Home and Work are surfaced as their own shortcuts, so keep them out of the list.
      if (place.category === 'home' || place.category === 'work') continue;
      if (!localMatches(place.label, place.address, trimmed)) continue;
      if (list.filter((row) => row.section === 'saved').length >= LOCAL_LIMIT) break;
      localIds.add(place.id);
      list.push({
        key: `saved:${place.id}`,
        section: 'saved',
        suggestion: savedToSuggestion(place, near, trimmed),
      });
    }

    for (const place of recent) {
      if (!localMatches(place.title, place.subtitle, trimmed)) continue;
      if (list.filter((row) => row.section === 'recent').length >= LOCAL_LIMIT) break;
      localIds.add(place.id);
      list.push({
        key: `recent:${place.id}`,
        section: 'recent',
        suggestion: recentToSuggestion(place, near, trimmed),
      });
    }

    for (const suggestion of results) {
      if (localIds.has(suggestion.id)) continue;
      list.push({ key: `result:${suggestion.id}`, section: 'results', suggestion });
    }

    return list;
  }, [trimmed, saved, recent, results, near]);

  const emptyResult =
    trimmed.length >= MIN_QUERY &&
    !loading &&
    !error &&
    rows.length === 0 &&
    resultsFor === debounced;

  const home = useMemo(() => saved.find((place) => place.category === 'home') ?? null, [saved]);
  const work = useMemo(() => saved.find((place) => place.category === 'work') ?? null, [saved]);

  return { rows, loading, error, emptyResult, home, work, retry };
}
