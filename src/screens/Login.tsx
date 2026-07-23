import { useState, type FormEvent } from 'react';
import { Mail, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { GoogleButton } from '@/components/auth/GoogleButton';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button, Card, Input } from '@/components/ui';
import { useAuth } from '@/state/AuthProvider';

import styles from './screens.module.css';

export function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, loginWithGoogle, devLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login({ email, password });
      navigate('/', { replace: true });
    } catch (cause) {
      setError((cause as { code?: string }).code ?? 'generic');
    } finally {
      setBusy(false);
    }
  }

  async function withGoogle(idToken: string) {
    setBusy(true);
    try {
      await loginWithGoogle(idToken);
      navigate('/', { replace: true });
    } catch (cause) {
      setError((cause as { code?: string }).code ?? 'generic');
    } finally {
      setBusy(false);
    }
  }

  async function withDevLogin() {
    setBusy(true);
    setError(null);
    try {
      await devLogin(email);
      navigate('/', { replace: true });
    } catch (cause) {
      setError((cause as { code?: string }).code ?? 'generic');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dk-screen">
      <ScreenHeader title={t('auth.loginTitle')} backTo="/" />
      <div className="dk-screen__body dk-screen__body--centered">
        <Card>
          <form className={styles.stack} onSubmit={(event) => void submit(event)}>
            <Input
              label={t('auth.email')}
              type="email"
              value={email}
              autoComplete="email"
              required
              iconStart={<Mail size={18} aria-hidden />}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              label={t('auth.password')}
              type="password"
              value={password}
              autoComplete="current-password"
              required
              hint={t('auth.passwordHint')}
              error={error ? t(`errors.${error}`) : undefined}
              iconStart={<Lock size={18} aria-hidden />}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" size="large" block loading={busy}>
              {t('auth.login')}
            </Button>
          </form>

          <div className={styles.divider}>{t('common.or')}</div>
          <GoogleButton onCredential={(token) => void withGoogle(token)} loading={busy} />
        </Card>

        <Button variant="ghost" className={styles.linkButton} onClick={() => navigate('/register')}>
          {t('auth.noAccount')}
        </Button>
        <Button
          variant="ghost"
          className={styles.linkButton}
          disabled={busy || !email}
          onClick={() => void withDevLogin()}
        >
          {t('auth.devLogin')}
        </Button>
        <Link to="/" className={styles.linkButton}>
          {t('auth.continueAsGuest')}
        </Link>
      </div>
    </div>
  );
}
