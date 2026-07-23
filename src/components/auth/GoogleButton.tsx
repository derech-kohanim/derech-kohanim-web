import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui';
import { env } from '@/env';

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
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
      if (!window.google || !host.current) return;
      window.google.accounts.id.initialize({
        client_id: env.googleClientId,
        callback: (response) => onCredential(response.credential),
      });
      window.google.accounts.id.renderButton(host.current, {
        theme: 'outline',
        size: 'large',
        width: host.current.clientWidth,
        locale: i18n.language,
      });
      setReady(true);
    }

    if (window.google) init();
    else script.addEventListener('load', init, { once: true });
  }, [onCredential, i18n.language]);

  if (env.googleClientId) {
    return <div ref={host} style={{ minHeight: 'var(--touch-min)' }} aria-busy={!ready} />;
  }

  if (env.mock) {
    return (
      <Button
        variant="outline"
        block
        loading={loading}
        onClick={() => onCredential('mock-google-id-token')}
      >
        {t('auth.google')}
      </Button>
    );
  }

  return (
    <Button variant="outline" block disabled title={t('auth.googleUnavailable')}>
      {t('auth.google')}
    </Button>
  );
}
