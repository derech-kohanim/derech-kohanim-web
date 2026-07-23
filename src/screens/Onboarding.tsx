import { useEffect, useState } from 'react';
import type { Stringency, TermsDocument } from '@dk/shared';
import { Check, Navigation, ShieldCheck, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api';
import { Button, Card, Skeleton, Switch } from '@/components/ui';
import { currentLanguage } from '@/i18n';
import { useAuth } from '@/state/AuthProvider';
import { usePreferences } from '@/state/PreferencesProvider';

import styles from './screens.module.css';

const LEVELS: Stringency[] = ['basic', 'taharat', 'machmirim'];
const LEVEL_HINT: Record<Stringency, string> = {
  basic: 'stringency.basicDescription',
  taharat: 'stringency.taharatDescription',
  machmirim: 'stringency.machmiritDescription',
};

export function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { preferences, update } = usePreferences();
  const { completeOnboarding } = useAuth();
  const [terms, setTerms] = useState<TermsDocument | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    void api
      .terms(currentLanguage())
      .then(setTerms)
      .catch(() => undefined);
  }, []);

  function start() {
    if (!accepted || !terms) {
      setShowError(true);
      return;
    }
    completeOnboarding(terms.version);
    navigate('/', { replace: true });
  }

  return (
    <div className="dk-screen">
      <div className="dk-screen__body dk-screen__body--centered">
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <Navigation size={30} aria-hidden />
          </span>
          <h1 className={`${styles.title} ${styles.titleCentered}`}>{t('app.name')}</h1>
          <p className={`${styles.lead} ${styles.leadCentered}`}>{t('onboarding.intro')}</p>
        </div>

        <Card>
          <h2 className={styles.title}>{t('onboarding.stringencyTitle')}</h2>
          <p className={styles.lead}>{t('onboarding.stringencyIntro')}</p>
          <div className={styles.stackTight}>
            {LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className={styles.choice}
                data-selected={preferences.stringency === level}
                aria-pressed={preferences.stringency === level}
                onClick={() => update({ stringency: level })}
              >
                <span className={styles.choiceText}>
                  <span className={styles.choiceLabel}>{t(`stringency.${level}`)}</span>
                  <span className={styles.choiceHint}>{t(LEVEL_HINT[level])}</span>
                </span>
                {preferences.stringency === level && <Check size={20} aria-hidden />}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className={styles.title}>{t('onboarding.promiseTitle')}</h2>
          <p className={styles.promise}>
            <ShieldCheck size={20} className={styles.promiseIcon} aria-hidden />
            {t('onboarding.promise.verified')}
          </p>
          <p className={styles.promise}>
            <Sparkles size={20} className={styles.promiseIcon} aria-hidden />
            {t('onboarding.promise.honest')}
          </p>
          <p className={styles.promise}>
            <Check size={20} className={styles.promiseIcon} aria-hidden />
            {t('onboarding.promise.notRabbi')}
          </p>
        </Card>

        <Card>
          <h2 className={styles.title}>{t('onboarding.termsTitle')}</h2>
          {terms ? (
            <p className={styles.terms}>{terms.body}</p>
          ) : (
            <div className={styles.stackTight}>
              <Skeleton height="var(--space-4)" />
              <Skeleton height="var(--space-4)" width="80%" />
              <Skeleton height="var(--space-4)" width="60%" />
            </div>
          )}
          <Switch
            checked={accepted}
            onCheckedChange={(value) => {
              setAccepted(value);
              setShowError(false);
            }}
            label={t('onboarding.termsAccept')}
          />
          {showError && (
            <p role="alert" className={styles.choiceHint}>
              {t('onboarding.mustAccept')}
            </p>
          )}
        </Card>

        <Button size="large" block onClick={start} disabled={!terms}>
          {t('onboarding.start')}
        </Button>
      </div>
    </div>
  );
}
