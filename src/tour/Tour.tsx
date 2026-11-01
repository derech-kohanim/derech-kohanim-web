import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui';

import styles from './tour.module.css';

/**
 * Guided tours: a dimmed screen with a cut-out around one control at a time and a short card
 * explaining it. Each screen has its own tour; the first visit starts it, "skip" closes that
 * tour only, and "don't show again" turns every tour off. Settings > Guide and tips resets all.
 */

export type TourId = 'home' | 'route' | 'drive';

export interface TourStep {
  /** Key under tour.<tourId>.<id> holding `title` and `body`. */
  id: string;
  /** The element to highlight, by its `data-tour` attribute. None centres the card. */
  target?: string;
  /** Leave the screen undimmed (the step is about the map itself, e.g. its coloured zones). */
  clear?: boolean;
}

export const TOURS: Record<TourId, TourStep[]> = {
  home: [
    { id: 'search', target: 'search' },
    { id: 'zone', clear: true },
    { id: 'legend', target: 'legend' },
    { id: 'level', target: 'level' },
    { id: 'locate', target: 'locate' },
    { id: 'account', target: 'account' },
    { id: 'done' },
  ],
  route: [
    { id: 'alternatives', target: 'alternatives' },
    { id: 'options', target: 'options' },
    { id: 'simulate', target: 'simulate' },
    { id: 'save', target: 'save' },
  ],
  drive: [
    { id: 'banner', target: 'banner' },
    { id: 'speed', target: 'speed' },
    { id: 'voice', target: 'voice' },
    { id: 'steps', target: 'steps' },
  ],
};

const SEEN_KEY = (id: TourId) => `dk.tour.seen.${id}`;
const NEVER_KEY = 'dk.tour.never';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the tour simply shows again next time.
  }
}

export function tourPending(id: TourId): boolean {
  return read(NEVER_KEY) === null && read(SEEN_KEY(id)) === null;
}

/** Settings > Guide and tips: every tour shows again, including after "don't show again". */
export function resetTours(): void {
  write(NEVER_KEY, null);
  (Object.keys(TOURS) as TourId[]).forEach((id) => write(SEEN_KEY(id), null));
}

/**
 * Starts the screen's tour once, the first time `ready` is true (the controls it points at are
 * on screen). Returns the overlay to render.
 */
export function useTour(id: TourId, ready: boolean) {
  const [active, setActive] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current || !tourPending(id)) return;
    // A short beat, so the map and the panel settle before the first highlight is measured.
    // Marked as started only when it fires: a cleanup in between (React re-running effects)
    // must leave it free to start again.
    const timer = window.setTimeout(() => {
      started.current = true;
      setActive(true);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [id, ready]);

  const close = useCallback(
    (never: boolean) => {
      write(SEEN_KEY(id), '1');
      if (never) write(NEVER_KEY, '1');
      setActive(false);
    },
    [id],
  );

  return active ? <TourOverlay id={id} onClose={close} /> : null;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function TourOverlay({ id, onClose }: { id: TourId; onClose: (never: boolean) => void }) {
  const { t } = useTranslation();
  const steps = TOURS[id];
  const [index, setIndex] = useState(0);
  const [never, setNever] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  // Measure the target now and while things around it settle (maps, sheets, fonts).
  useLayoutEffect(() => {
    let frame = 0;
    let until = performance.now() + 1200;
    function measure() {
      const element = step.target
        ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
        : null;
      if (element) {
        // A wrapper marked data-tour-inner stretches wider than what it holds: measure the child.
        const measured =
          element.hasAttribute('data-tour-inner') && element.firstElementChild
            ? element.firstElementChild
            : element;
        const r = measured.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
        } else {
          setBox(null);
        }
      } else {
        setBox(null);
      }
      if (performance.now() < until) frame = requestAnimationFrame(measure);
    }
    measure();
    function onResize() {
      until = performance.now() + 300;
      cancelAnimationFrame(frame);
      measure();
    }
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, [step]);

  useEffect(() => {
    cardRef.current?.focus();
  }, [index]);

  const pad = 8;
  // The card goes on the side of the screen with more room.
  const below = box ? box.top + box.height / 2 < window.innerHeight / 2 : false;
  const cardStyle: React.CSSProperties = !box
    ? step.clear
      ? { bottom: 96 }
      : { top: '50%', transform: 'translateY(-50%)' }
    : below
      ? { top: Math.min(box.top + box.height + pad + 12, window.innerHeight - 200) }
      : { bottom: Math.max(window.innerHeight - box.top + pad + 12, 16) };

  return createPortal(
    <div className={styles.layer} role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {box ? (
        <div
          className={styles.spot}
          style={{
            top: box.top - pad,
            left: box.left - pad,
            width: box.width + pad * 2,
            height: box.height + pad * 2,
          }}
        />
      ) : step.clear ? null : (
        <div className={styles.scrim} />
      )}
      <div ref={cardRef} className={styles.card} style={cardStyle} tabIndex={-1}>
        <h2 id="tour-title" className={styles.title}>
          {t(`tour.${id}.${step.id}.title`)}
        </h2>
        <p className={styles.body}>{t(`tour.${id}.${step.id}.body`)}</p>
        {index === 0 && (
          <label className={styles.never}>
            <input
              id="tour-never"
              type="checkbox"
              checked={never}
              onChange={(event) => setNever(event.target.checked)}
            />
            {t('tour.never')}
          </label>
        )}
        <div className={styles.meta}>
          <div className={styles.dots} aria-label={t('tour.progress', { current: index + 1, total: steps.length })}>
            {steps.map((s, i) => (
              <span key={s.id} className={styles.dot} data-on={i === index} />
            ))}
          </div>
          <div className={styles.actions}>
            {!last && (
              <button type="button" className={styles.skip} onClick={() => onClose(never)}>
                {t('tour.skip')}
              </button>
            )}
            {index > 0 && (
              <Button variant="outline" onClick={() => setIndex(index - 1)}>
                {t('tour.prev')}
              </Button>
            )}
            <Button onClick={() => (last ? onClose(never) : setIndex(index + 1))}>
              {last ? t('tour.done') : t('tour.next')}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
