import { useEffect, useState } from 'react';

/**
 * Tracks whether the browser currently has network connectivity, seeded from `navigator.onLine`
 * and kept live by the `online`/`offline` events. Used to drive the connectivity status banner.
 */
export function useConnectivity(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
