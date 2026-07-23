import { splitByRanges, type MatchedRange } from '@/lib/highlight';

import styles from './destinationSearch.module.css';

/** Highlights exactly what the server said matched, never a client side guess. */
export function Highlighted({ text, ranges }: { text: string; ranges: MatchedRange[] }) {
  const segments = splitByRanges(text, ranges);

  return (
    <>
      {segments.map((segment, index) =>
        segment.matched ? (
          <mark key={index} className={styles.mark}>
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
