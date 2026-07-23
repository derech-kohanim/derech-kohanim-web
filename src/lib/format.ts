import type { Language } from '@dk/shared';

const LOCALE: Record<Language, string> = { he: 'he-IL', en: 'en-GB' };

export function formatDistance(meters: number, language: Language): string {
  const locale = LOCALE[language];
  if (meters < 1000) {
    const rounded = meters < 100 ? Math.round(meters / 10) * 10 : Math.round(meters / 50) * 50;
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'meter',
      unitDisplay: 'short',
      maximumFractionDigits: 0,
    }).format(rounded);
  }
  const km = meters / 1000;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'kilometer',
    unitDisplay: 'short',
    maximumFractionDigits: km < 10 ? 1 : 0,
  }).format(km);
}

/** Minutes for anything under an hour, then "1:05" style. */
export function formatDuration(seconds: number, language: Language): string {
  const locale = LOCALE[language];
  const totalMinutes = Math.max(1, Math.round(seconds / 60));

  if (totalMinutes < 60) {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'minute',
      unitDisplay: 'short',
    }).format(totalMinutes);
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hoursText = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'hour',
    unitDisplay: 'short',
  }).format(hours);
  if (minutes === 0) return hoursText;
  const minutesText = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'minute',
    unitDisplay: 'short',
  }).format(minutes);
  return `${hoursText} ${minutesText}`;
}

/** Clock time of arrival, the number a driver actually looks for. */
export function formatArrival(fromNowSeconds: number, language: Language): string {
  const arrival = new Date(Date.now() + fromNowSeconds * 1000);
  return new Intl.DateTimeFormat(LOCALE[language], {
    hour: '2-digit',
    minute: '2-digit',
  }).format(arrival);
}

export function formatRelativeDay(iso: string, language: Language): string {
  const then = new Date(iso).getTime();
  const days = Math.round((Date.now() - then) / 86_400_000);
  const formatter = new Intl.RelativeTimeFormat(LOCALE[language], { numeric: 'auto' });
  if (days < 1) return formatter.format(0, 'day');
  if (days < 30) return formatter.format(-days, 'day');
  return new Intl.DateTimeFormat(LOCALE[language], { dateStyle: 'medium' }).format(then);
}
