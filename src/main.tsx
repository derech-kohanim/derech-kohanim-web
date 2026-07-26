import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import './i18n';
import './styles/global.css';
import { initAnalytics } from './lib/analytics';
import { tokenColor } from './lib/tokenColor';

/** Built at runtime so the mark follows the design tokens instead of a copied colour. */
function paintFavicon(): void {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${tokenColor('primary')}"/><path d="M16 6 L25 26 L16 21 L7 26 Z" fill="${tokenColor('primary-contrast')}"/></svg>`;
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

paintFavicon();

// No-op unless VITE_GA_MEASUREMENT_ID is set, so nothing loads by default.
initAnalytics();

const container = document.getElementById('root');
if (!container) throw new Error('Root container is missing');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
