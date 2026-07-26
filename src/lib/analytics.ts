import { env } from '@/env';

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFn;
  }
}

/** Non-PII event parameters. Scalars only: never addresses, coordinates, or user identifiers. */
export type EventParams = Record<string, string | number | boolean | undefined>;

let initialized = false;

/** True only once a measurement id is configured and gtag has been wired up. */
function ready(): boolean {
  return Boolean(env.gaMeasurementId) && typeof window !== 'undefined' && Boolean(window.gtag);
}

/**
 * Load gtag.js and initialize GA4, once, at app startup. Entirely inert when
 * VITE_GA_MEASUREMENT_ID is empty (the default): no script is injected, no globals are set,
 * and every helper below no-ops. The owner turns analytics on purely by setting the env var.
 */
export function initAnalytics(): void {
  const id = env.gaMeasurementId;
  if (!id || initialized || typeof document === 'undefined') return;
  initialized = true;

  window.dataLayer = window.dataLayer ?? [];
  const gtag: GtagFn = function gtag() {
    // gtag.js consumes the arguments object verbatim, so forward it unchanged.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag = gtag;

  gtag('js', new Date());
  // Page views are sent manually on each route change (this is an SPA), so suppress the
  // automatic one that would otherwise fire on config.
  gtag('config', id, { send_page_view: false });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

/** A tiny typed facade so call sites stay clean and free of window/gtag plumbing. */
export const analytics = {
  /** Send a page_view for a route change. Path only, to keep it out of PII. */
  pageView(path: string): void {
    if (!ready()) return;
    window.gtag!('event', 'page_view', { page_path: path });
  },
  /** Send a GA4 event. Keep params minimal and non-PII. */
  event(name: string, params?: EventParams): void {
    if (!ready()) return;
    window.gtag!('event', name, params);
  },
};
