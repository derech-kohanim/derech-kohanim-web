import { useState } from 'react';
import { SUPPORT_KINDS, type LatLng, type SupportKind } from '@dk/shared';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { api } from '@/api';
import { ApiClientError } from '@/api/types';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button } from '@/components/ui';
import { TAHARAT_PHONE } from '@/lib/contacts';
import { useAuth } from '@/state/AuthProvider';

import styles from './screens.module.css';

/** What the screen that opened the report already knows. Passed as router state. */
export interface ReportContext {
  kind?: SupportKind;
  routeId?: string;
  zoneId?: number;
  zoneName?: string;
  location?: LatLng;
  /** True when the location is a mark the driver dropped during a drive. */
  marked?: boolean;
}

const MAX = 4000;

/**
 * Report and feedback: a signed-in user writes what happened; the server files it as an issue in
 * the private support repository with the route, zone or point it is about. Guests are asked to
 * sign in first.
 */
export function Report() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const context = (location.state ?? {}) as ReportContext;
  const { user } = useAuth();
  const [kind, setKind] = useState<SupportKind | null>(context.kind ?? null);
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: number | null } | null>(null);

  function close() {
    if (window.history.length > 1) navigate(-1);
    else navigate('/settings');
  }

  async function send() {
    if (!kind || !message.trim()) return;
    setSending(true);
    setError(null);
    try {
      const result = await api.submitSupportReport({
        kind,
        message: message.trim(),
        platform: 'web',
        appVersion: __APP_VERSION__,
        device: navigator.userAgent.slice(0, 200),
        routeId: context.routeId,
        zoneId: context.zoneId,
        location: context.location,
        replyByEmail: reply,
      });
      setDone({ reference: result.reference });
    } catch (caught) {
      setError(
        caught instanceof ApiClientError && caught.code === 'support_rate_limited'
          ? t('report.rateLimited')
          : t('report.failed'),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="dk-screen">
      <ScreenHeader title={t('report.title')} backTo="/settings" />
      <div className="dk-screen__body">
        {!user ? (
          <div className={styles.emptyCard}>
            <h2 className={styles.emptyTitle}>{t('report.guestTitle')}</h2>
            <p className={styles.emptyBody}>{t('report.guestBody')}</p>
            <div className={styles.emptyActions}>
              <Button
                onClick={() =>
                  navigate('/login', { state: { returnTo: '/report' }, replace: false })
                }
              >
                {t('auth.login')}
              </Button>
              <Button variant="outline" onClick={close}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : done ? (
          <div className={styles.emptyCard}>
            <h2 className={styles.emptyTitle}>{t('report.thanksTitle')}</h2>
            <p className={styles.emptyBody}>
              {done.reference !== null
                ? t('report.thanksReference', { reference: done.reference })
                : t('report.thanksKept')}
            </p>
            <div className={styles.emptyActions}>
              <Button onClick={close}>{t('common.close')}</Button>
            </div>
          </div>
        ) : (
          <>
            <section className={styles.settingsGroupWrap}>
              <h2 className={styles.settingsGroupTitle}>{t('report.kindTitle')}</h2>
              <div className={styles.settingsGroup} role="radiogroup" aria-label={t('report.kindTitle')}>
                {SUPPORT_KINDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={kind === value}
                    data-selected={kind === value}
                    className={styles.settingsRow}
                    onClick={() => setKind(value)}
                  >
                    <span className={styles.settingsRadio} aria-hidden />
                    <span className={styles.actionText}>
                      {t(`report.kinds.${value}.title`)}
                      <span className={styles.actionSubtitle}>{t(`report.kinds.${value}.hint`)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {kind === 'data' && (
              <p className={styles.reportNote}>
                {t('report.dataNote')} <bdi dir="ltr">{TAHARAT_PHONE}</bdi>.
              </p>
            )}

            <label className={styles.reportField} htmlFor="report-message">
              <span className={styles.settingsGroupTitle}>{t('report.messageTitle')}</span>
              <textarea
                id="report-message"
                className={styles.reportText}
                rows={6}
                maxLength={MAX}
                value={message}
                placeholder={t(`report.placeholders.${kind ?? 'bug'}`)}
                onChange={(event) => setMessage(event.target.value)}
              />
              <span className={styles.reportCounter}>
                {message.length}/{MAX}
              </span>
            </label>

            {(context.routeId || context.zoneId != null || context.location) && (
              <div className={styles.reportChips}>
                {context.routeId && <span className={styles.reportChip}>{t('report.attachedRoute')}</span>}
                {context.zoneId != null && (
                  <span className={styles.reportChip}>
                    {t('report.attachedZone', { name: context.zoneName ?? `#${context.zoneId}` })}
                  </span>
                )}
                {context.location && context.marked && (
                  <span className={styles.reportChip}>{t('report.attachedMark')}</span>
                )}
              </div>
            )}

            {user.email && (
              <label className={styles.reportCheck}>
                <input
                  id="report-reply"
                  type="checkbox"
                  checked={reply}
                  onChange={(event) => setReply(event.target.checked)}
                />
                {t('report.replyByEmail', { email: user.email })}
              </label>
            )}

            <p className={styles.reportFine}>{t('report.fineprint')}</p>
            {error && (
              <p role="alert" className={styles.reportError}>
                {error}
              </p>
            )}

            <div className={styles.routeActions}>
              <Button
                className={styles.routeActionMain}
                disabled={!kind || !message.trim() || sending}
                onClick={() => void send()}
              >
                {t('report.send')}
              </Button>
              <Button variant="outline" onClick={close}>
                {t('common.cancel')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
