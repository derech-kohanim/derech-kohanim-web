import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui';
import { env } from '@/env';

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response?: { credential?: string }) => void;
      }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/** The official four-color Google "G" mark, inlined so it needs no network request. Decorative. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
    </svg>
  );
}

// Google Identity Services must be initialized exactly once per page load; a second call warns
// ("initialize() is called multiple times") and is otherwise ignored.
let initialized = false;

/**
 * Renders the official Google button when a client id is configured. In mock mode it stands
 * in for the whole flow so the screen can be reviewed, and with neither it says so plainly.
 */
export function GoogleButton({
  onCredential,
  loading,
}: {
  onCredential: (idToken: string) => void;
  loading?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // Hold the latest callback in a ref so the effect never has to re-run (and re-initialize GSI)
  // just because the parent passed a fresh function identity.
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    if (!env.googleClientId) return;

    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }

    function init() {
      // Read the namespace defensively: `window.google` can be set a moment before
      // `accounts.id` exists, and a dismissed/failed prompt can call back with no credential.
      const id = window.google?.accounts?.id;
      if (!id || !host.current) return;
      if (!initialized) {
        id.initialize({
          client_id: env.googleClientId,
          callback: (response) => {
            if (response?.credential) onCredentialRef.current(response.credential);
          },
        });
        initialized = true;
      }
      id.renderButton(host.current, {
        theme: 'outline',
        size: 'large',
        width: host.current.clientWidth,
        locale: i18n.language,
      });
      setReady(true);
    }

    if (window.google?.accounts?.id) init();
    else script.addEventListener('load', init, { once: true });

    return () => script?.removeEventListener('load', init);
  }, [i18n.language]);

  if (env.googleClientId) {
    return <div ref={host} style={{ minHeight: 'var(--touch-min)' }} aria-busy={!ready} />;
  }

  if (env.mock) {
    return (
      <Button
        variant="outline"
        block
        loading={loading}
        iconStart={<GoogleIcon />}
        onClick={() => onCredential('mock-google-id-token')}
      >
        {t('auth.google')}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      block
      disabled
      iconStart={<GoogleIcon />}
      title={t('auth.googleUnavailable')}
    >
      {t('auth.google')}
    </Button>
  );
}
