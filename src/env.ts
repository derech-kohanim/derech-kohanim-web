const flag = (value: string | undefined, fallback: boolean) =>
  value === undefined || value === '' ? fallback : value !== 'false' && value !== '0';

export const env = {
  /** Mock mode serves fixtures from the browser. Off by default: the app talks to the API. */
  mock: flag(import.meta.env.VITE_MOCK, false),
  apiBase: import.meta.env.VITE_API_BASE ?? '',
  googleMapsKey: import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '',
  /** A vector Map ID is required for the map to rotate heading-up while driving. */
  googleMapsId: import.meta.env.VITE_GOOGLE_MAPS_ID ?? '',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
};
