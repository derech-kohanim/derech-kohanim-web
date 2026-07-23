import type { LatLng } from '@dk/shared';

const PAIR = /^\s*(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/;

/**
 * Recognises a typed coordinate pair so the field can offer it without a network call.
 * Accepts a comma, a semicolon or whitespace as the separator, and a decimal comma when the
 * separator is unambiguous.
 */
export function parseCoordinates(input: string): LatLng | null {
  const match = PAIR.exec(input);
  if (!match) return null;

  const lat = Number.parseFloat(match[1].replace(',', '.'));
  const lng = Number.parseFloat(match[2].replace(',', '.'));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // Two bare integers are far more likely to be a house number than a location.
  if (!match[1].includes('.') && !match[1].includes(',') && !match[2].includes('.')) return null;

  return { lat, lng };
}

export function formatCoordinates(point: LatLng): string {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}
