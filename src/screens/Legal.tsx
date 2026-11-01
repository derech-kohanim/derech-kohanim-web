import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { TermsDocument } from '@dk/shared';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppLoader, Button, Card, Markdown } from '@/components/ui';
import { env } from '@/env';
import { currentLanguage } from '@/i18n';

import styles from './screens.module.css';

/**
 * The two policy documents, on their own addressable pages (/terms and /privacy) so they can be
 * linked from anywhere - a store listing, an email, the onboarding wizard - and read without an
 * account or even without having accepted the terms yet.
 *
 * The terms are the versioned document the user accepts, so they come from the server and the
 * page shows what was actually accepted. The bundled copy in the locale files is the fallback
 * for an offline or unreachable server, and says so. The privacy policy has no acceptance and
 * no version, so it ships with the app.
 */

/** Renders the ISO date in the reader's locale, or nothing when it is not a date. */
function useFormattedDate(iso: string | undefined): string | null {
  return useMemo(() => {
    if (!iso) return null;
    const time = new Date(iso).getTime();
    if (Number.isNaN(time)) return null;
    return new Intl.DateTimeFormat(currentLanguage() === 'en' ? 'en-GB' : 'he-IL', {
      dateStyle: 'long',
    }).format(time);
  }, [iso]);
}

/**
 * Inline links to the two documents, for the places that reference them in passing (the
 * onboarding terms step, the registration form). Plain anchors opening in a new tab rather than
 * router navigation: both callers sit in a flow that would be lost by navigating away from it.
 */
export function LegalLinks({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <p className={className ? `${styles.legalLinks} ${className}` : styles.legalLinks}>
      <a className={styles.legalLink} href="/terms" target="_blank" rel="noreferrer noopener">
        {t('legal.termsTitle')}
      </a>
      <a className={styles.legalLink} href="/privacy" target="_blank" rel="noreferrer noopener">
        {t('legal.privacyTitle')}
      </a>
    </p>
  );
}

interface DocumentPageProps {
  title: string;
  body: string;
  updatedAt?: string;
  /** Shown above the document when the server copy could not be fetched. */
  notice?: string;
  loading?: boolean;
  footer?: ReactNode;
}

function DocumentPage({ title, body, updatedAt, notice, loading, footer }: DocumentPageProps) {
  const { t } = useTranslation();
  const updated = useFormattedDate(updatedAt);
  // The contact section is appended to the document rather than rendered beside it, so it
  // inherits the same typography and reads as part of the policy.
  const source = env.contactEmail
    ? `${body}\n\n## ${t('legal.contactTitle')}\n\n${t('legal.contactBody', { email: env.contactEmail })}`
    : body;

  return (
    <div className="dk-screen">
      <ScreenHeader title={title} backTo="/settings" />
      <div className="dk-screen__body">
        <Card>
          {loading ? (
            <AppLoader label={t('common.loading')} />
          ) : (
            <>
              {updated && <p className={styles.choiceHint}>{t('legal.updated', { date: updated })}</p>}
              {notice && (
                <p role="status" className={styles.legalNotice}>
                  {notice}
                </p>
              )}
              <Markdown source={source} headingLevel={2} />
            </>
          )}
        </Card>
        {footer}
      </div>
    </div>
  );
}

export function Terms() {
  const { t, i18n } = useTranslation();
  const [terms, setTerms] = useState<TermsDocument | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    api
      .terms(currentLanguage())
      .then((document) => {
        if (!cancelled) setTerms(document);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // The document is per language, so a language switch refetches it.
  }, [i18n.language]);

  const body = terms?.body?.trim() || t('legal.termsBody');

  return (
    <DocumentPage
      title={terms?.title || t('legal.termsTitle')}
      body={body}
      updatedAt={terms?.updatedAt}
      notice={failed ? t('legal.bundledNotice') : undefined}
      loading={loading}
    />
  );
}

export function Privacy() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <DocumentPage
      title={t('legal.privacyTitle')}
      body={t('legal.privacyBody')}
      updatedAt={t('legal.privacyUpdated')}
      footer={
        <Button
          variant="outline"
          size="large"
          iconStart={<Trash2 size={18} aria-hidden />}
          onClick={() => navigate('/delete-account')}
        >
          {t('legal.deleteAccountAction')}
        </Button>
      }
    />
  );
}
