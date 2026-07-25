import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@dk/shared': fileURLToPath(
        new URL('../derech-kohanim-shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
    // Google Identity Services opens a sign-in popup and posts the credential back to this
    // window. A plain `same-origin` COOP would sever that opener link and log
    // "Cross-Origin-Opener-Policy policy would block the window.postMessage call". Allowing
    // popups keeps the isolation while letting the OAuth popup talk back.
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' },
    // The shared contract lives in a sibling repository.
    fs: { allow: ['..'] },
  },
});
