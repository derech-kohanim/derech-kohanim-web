export interface MatchedRange {
  start: number;
  length: number;
}

const QUOTES = /['`‘’׳״"]/g;

/** Length preserving on purpose: the ranges it produces index into the original string. */
export function normalise(value: string): string {
  return value.toLocaleLowerCase().replace(QUOTES, "'");
}

/**
 * Ranges of `text` covered by the query tokens. The server sends these for network results;
 * this is the local equivalent for saved and recent places, so both look identical.
 */
export function matchRanges(text: string, query: string): MatchedRange[] {
  const haystack = normalise(text);
  const tokens = normalise(query).split(/\s+/).filter(Boolean);
  const ranges: MatchedRange[] = [];

  for (const token of tokens) {
    let from = 0;
    for (;;) {
      const index = haystack.indexOf(token, from);
      if (index === -1) break;
      ranges.push({ start: index, length: token.length });
      from = index + token.length;
    }
  }

  return mergeRanges(ranges);
}

export function mergeRanges(ranges: MatchedRange[]): MatchedRange[] {
  if (ranges.length === 0) return ranges;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: MatchedRange[] = [sorted[0]];

  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (range.start <= last.start + last.length) {
      last.length = Math.max(last.length, range.start + range.length - last.start);
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

export interface HighlightSegment {
  text: string;
  matched: boolean;
}

export function splitByRanges(text: string, ranges: MatchedRange[]): HighlightSegment[] {
  const merged = mergeRanges(ranges).filter(
    (range) => range.start >= 0 && range.length > 0 && range.start < text.length,
  );
  if (merged.length === 0) return [{ text, matched: false }];

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const range of merged) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), matched: false });
    }
    const end = Math.min(text.length, range.start + range.length);
    segments.push({ text: text.slice(range.start, end), matched: true });
    cursor = end;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), matched: false });
  return segments;
}
