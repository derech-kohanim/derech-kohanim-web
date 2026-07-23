import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { LatLng, PlaceSuggestion, SavedPlace } from '@dk/shared';
import { AlertCircle, Briefcase, Home, SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { api } from '@/api';
import { Button, SearchField, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDistance } from '@/lib/format';
import type { Destination } from '@/state/TripProvider';

import { CategoryIcon } from './CategoryIcon';
import { Highlighted } from './Highlighted';
import styles from './destinationSearch.module.css';
import { useSuggestions, type SuggestionRow, type SuggestionSection } from './useSuggestions';

const SECTION_LABEL: Record<SuggestionSection, string> = {
  coordinates: 'search.sectionCoordinates',
  saved: 'search.sectionSaved',
  recent: 'search.sectionRecent',
  results: 'search.sectionResults',
};

export interface DestinationSearchProps {
  onSelect: (destination: Destination) => void;
  /** Biases and sorts results, and drives the distance column. */
  near?: LatLng;
  autoFocus?: boolean;
  size?: 'medium' | 'large';
  className?: string;
}

export function DestinationSearch({
  onSelect,
  near,
  autoFocus = false,
  size = 'large',
  className,
}: DestinationSearchProps) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { rows, loading, error, emptyResult, home, work, retry } = useSuggestions(query, near);
  const showShortcuts = query.trim().length === 0 && Boolean(home || work);

  useEffect(() => {
    setActiveIndex(rows.length > 0 ? 0 : -1);
  }, [rows]);

  useEffect(() => {
    if (activeIndex < 0 || !panelRef.current) return;
    const element = panelRef.current.querySelector(`[data-index="${activeIndex}"]`);
    element?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const select = useCallback(
    (suggestion: PlaceSuggestion) => {
      if (!suggestion.location) return;
      const destination: Destination = {
        id: suggestion.id,
        title: suggestion.title,
        subtitle: suggestion.subtitle,
        location: suggestion.location,
      };
      void api
        .recordRecentPlace({
          title: suggestion.title,
          subtitle: suggestion.subtitle,
          location: suggestion.location,
          externalId: suggestion.externalId,
        })
        .catch(() => undefined);

      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
      onSelect(destination);
    },
    [onSelect],
  );

  const selectSaved = useCallback(
    (place: SavedPlace) => {
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
      onSelect({
        id: place.id,
        title: place.label,
        subtitle: place.address,
        location: place.location,
      });
    },
    [onSelect],
  );

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (open) {
        setOpen(false);
      } else if (query) {
        setQuery('');
      }
      return;
    }

    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }

    if (rows.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setOpen(true);
        setActiveIndex((index) => (index + 1) % rows.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setOpen(true);
        setActiveIndex((index) => (index - 1 + rows.length) % rows.length);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(rows.length - 1);
        break;
      case 'Enter': {
        const row = rows[activeIndex];
        if (row) {
          event.preventDefault();
          select(row.suggestion);
        }
        break;
      }
      default:
        break;
    }
  }

  const grouped = useMemo(() => groupRows(rows), [rows]);
  const showPanel =
    open && (rows.length > 0 || loading || error !== null || emptyResult || showShortcuts);
  const language = i18n.language === 'en' ? 'en' : 'he';

  return (
    <div className={cn(styles.root, className)}>
      <SearchField
        ref={inputRef}
        value={query}
        onValueChange={(value) => {
          setQuery(value);
          setOpen(true);
        }}
        onClear={() => inputRef.current?.focus()}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        loading={loading}
        size={size}
        autoFocus={autoFocus}
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        aria-describedby={`${listId}-instructions`}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={`${listId}-list`}
        aria-autocomplete="list"
        aria-activedescendant={
          showPanel && activeIndex >= 0 ? `${listId}-row-${activeIndex}` : undefined
        }
      />

      <span id={`${listId}-instructions`} className="dk-visually-hidden">
        {t('search.instructions')}
      </span>
      <span className="dk-visually-hidden" role="status" aria-live="polite">
        {showPanel && rows.length > 0 ? t('search.resultsAnnouncement', { count: rows.length }) : ''}
      </span>

      {showPanel && (
        <div
          ref={panelRef}
          className={styles.panel}
          // The mouse must not blur the input before the click lands.
          onMouseDown={(event) => event.preventDefault()}
        >
          {showShortcuts && (
            <div className={styles.shortcuts}>
              {home && (
                <button
                  type="button"
                  className={styles.shortcut}
                  onClick={() => selectSaved(home)}
                >
                  <Home size={20} aria-hidden />
                  {t('category.home')}
                </button>
              )}
              {work && (
                <button
                  type="button"
                  className={styles.shortcut}
                  onClick={() => selectSaved(work)}
                >
                  <Briefcase size={20} aria-hidden />
                  {t('category.work')}
                </button>
              )}
            </div>
          )}

          {loading && rows.length === 0 && <SkeletonRows />}

          {error !== null && (
            <div className={styles.state}>
              <AlertCircle size={28} aria-hidden />
              <span className={styles.stateTitle}>{t('search.error')}</span>
              <span className={styles.stateHint}>
                {i18n.exists(`errors.${error}`) ? t(`errors.${error}`) : t('search.errorHint')}
              </span>
              <Button variant="outline" size="small" onClick={retry}>
                {t('common.retry')}
              </Button>
            </div>
          )}

          {emptyResult && (
            <div className={styles.state}>
              <SearchX size={28} aria-hidden />
              <span className={styles.stateTitle}>{t('search.empty', { query: query.trim() })}</span>
              <span className={styles.stateHint}>{t('search.emptyHint')}</span>
            </div>
          )}

          {rows.length > 0 && (
            <ul id={`${listId}-list`} role="listbox" aria-label={t('search.label')}>
              {grouped.map((group) => (
                <li key={group.section} role="presentation">
                  <span className={styles.sectionLabel} id={`${listId}-${group.section}`}>
                    {t(SECTION_LABEL[group.section])}
                  </span>
                  <ul role="group" aria-labelledby={`${listId}-${group.section}`}>
                    {group.rows.map(({ row, index }) => (
                      <li
                        key={row.key}
                        id={`${listId}-row-${index}`}
                        data-index={index}
                        data-active={index === activeIndex}
                        role="option"
                        aria-selected={index === activeIndex}
                        className={styles.row}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => select(row.suggestion)}
                      >
                        <span
                          className={cn(
                            styles.icon,
                            row.section === 'saved' && styles['icon--saved'],
                            row.section === 'coordinates' && styles['icon--coordinates'],
                          )}
                        >
                          <CategoryIcon
                            category={row.suggestion.category}
                            section={row.section}
                          />
                        </span>
                        <span className={styles.text}>
                          <span className={styles.title}>
                            <Highlighted
                              text={row.suggestion.title}
                              ranges={row.suggestion.matchedRanges}
                            />
                          </span>
                          {row.suggestion.subtitle && (
                            <span className={styles.subtitle}>{row.suggestion.subtitle}</span>
                          )}
                        </span>
                        {row.suggestion.distanceMeters !== null && (
                          <span className={styles.distance}>
                            {formatDistance(row.suggestion.distanceMeters, language)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface RowGroup {
  section: SuggestionSection;
  rows: { row: SuggestionRow; index: number }[];
}

function groupRows(rows: SuggestionRow[]): RowGroup[] {
  const groups: RowGroup[] = [];
  rows.forEach((row, index) => {
    const last = groups[groups.length - 1];
    if (last && last.section === row.section) last.rows.push({ row, index });
    else groups.push({ section: row.section, rows: [{ row, index }] });
  });
  return groups;
}

function SkeletonRows() {
  return (
    <div aria-hidden>
      {[0, 1, 2].map((index) => (
        <div key={index} className={styles.skeletonRow}>
          <Skeleton width="var(--space-10)" height="var(--space-10)" radius="var(--radius-md)" />
          <span className={styles.skeletonText}>
            <Skeleton width={index === 1 ? '55%' : '70%'} height="var(--space-4)" />
            <Skeleton width={index === 2 ? '30%' : '40%'} height="var(--space-3)" />
          </span>
        </div>
      ))}
    </div>
  );
}
