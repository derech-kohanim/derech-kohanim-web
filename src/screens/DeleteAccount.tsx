import { useState, type FormEvent } from 'react';
import { CheckCircle2, Mail, MessageSquare, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button, Card, CardTitle, Input } from '@/components/ui';
import { useAuth } from '@/state/AuthProvider';

import styles from './screens.module.css';

const STEPS = ['recorded', 'verified', 'removed', 'irreversible'] as const;

/**
 * The public deletion-request address (/delete-account). Reachable without an account and
 * outside the onboarding gate on purpose: the people most likely to open it are the ones who
 * have already signed out or removed the app, and a store listing needs a URL that works for
 * anyone who follows it.
 *
 * Submitting records a request. Nothing is deleted here - an operator verifies the requester
 * first, which is the only honest thing a form with no proof of identity can do.
 */
export function DeleteAccount() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) {
      setError(t('deleteAccount.emailRequired'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.requestAccountDeletion({ email: address, reason: reason.trim() || undefined });
      setSent(true);
    } catch {
      setError(t('deleteAccount.failed'));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="dk-screen">
        <ScreenHeader title={t('deleteAccount.title')} backTo="/" />
        <div className="dk-screen__body dk-screen__body--centered">
          <Card>
            <div className={styles.arrivedCard}>
              <CheckCircle2 size={40} aria-hidden />
              <h2 className={styles.title}>{t('deleteAccount.successTitle')}</h2>
              <p className={styles.lead}>{t('deleteAccount.successBody')}</p>
            </div>
          </Card>
          <Button variant="outline" size="large" onClick={() => navigate('/')}>
            {t('deleteAccount.backHome')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="dk-screen">
      <ScreenHeader title={t('deleteAccount.title')} backTo="/settings" />
      <div className="dk-screen__body dk-screen__body--centered">
        <Card>
          <p className={styles.lead}>{t('deleteAccount.intro')}</p>
          <form className={styles.stack} onSubmit={(event) => void submit(event)}>
            <Input
              label={t('deleteAccount.emailLabel')}
              type="email"
              value={email}
              autoComplete="email"
              required
              // A signed-in caller's own address is what the server records anyway, so the
              // field is read-only rather than a place to type somebody else's account in.
              readOnly={Boolean(user?.email)}
              hint={user?.email ? undefined : t('deleteAccount.emailHint')}
              error={error ?? undefined}
              iconStart={<Mail size={18} aria-hidden />}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              label={t('deleteAccount.reasonLabel')}
              value={reason}
              placeholder={t('deleteAccount.reasonPlaceholder')}
              maxLength={2000}
              iconStart={<MessageSquare size={18} aria-hidden />}
              onChange={(event) => setReason(event.target.value)}
            />
            <p className={styles.choiceHint}>
              {user?.email
                ? t('deleteAccount.signedInAs', { email: user.email })
                : t('deleteAccount.guestNote')}
            </p>
            <Button
              type="submit"
              variant="danger"
              size="large"
              block
              loading={busy}
              iconStart={<Trash2 size={18} aria-hidden />}
            >
              {t('deleteAccount.submit')}
            </Button>
          </form>
        </Card>

        <Card>
          <CardTitle>{t('deleteAccount.whatHappensTitle')}</CardTitle>
          <ul className={styles.legalList}>
            {STEPS.map((step) => (
              <li key={step}>{t(`deleteAccount.whatHappens.${step}`)}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
