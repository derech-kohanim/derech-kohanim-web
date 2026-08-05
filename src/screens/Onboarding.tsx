import { useEffect, useMemo, useState } from 'react';
import type { Stringency, TermsDocument } from '@dk/shared';
import {
  BookOpenCheck,
  Check,
  MapPin,
  Navigation,
  Route as RouteIcon,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api';
import { Button, Card, Markdown, Skeleton, Switch } from '@/components/ui';
import { currentLanguage } from '@/i18n';
import { useAuth } from '@/state/AuthProvider';
import { usePreferences } from '@/state/PreferencesProvider';

import { LegalLinks } from './Legal';
import styles from './screens.module.css';

const LEVELS: Stringency[] = ['basic', 'taharat', 'machmirim'];
const LEVEL_HINT: Record<Stringency, string> = {
  basic: 'stringency.basicDescription',
  taharat: 'stringency.taharatDescription',
  machmirim: 'stringency.machmiritDescription',
};

const HOW_STEPS: { key: string; icon: LucideIcon }[] = [
  { key: 'destination', icon: MapPin },
  { key: 'compute', icon: RouteIcon },
  { key: 'beforeDeparture', icon: ShieldCheck },
  { key: 'voice', icon: Volume2 },
];

type StepId = 'welcome' | 'how' | 'data' | 'stringency' | 'terms';
const STEPS: StepId[] = ['welcome', 'how', 'data', 'stringency', 'terms'];

export function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { preferences, update } = usePreferences();
  const { completeOnboarding } = useAuth();
  const [step, setStep] = useState(0);
  const [terms, setTerms] = useState<TermsDocument | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    void api
      .terms(currentLanguage())
      .then(setTerms)
      .catch(() => undefined);
  }, []);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const termsBody = useMemo(() => terms?.body?.trim() ?? '', [terms]);

  function goBack() {
    setStep((value) => Math.max(0, value - 1));
  }

  function goNext() {
    if (isLast) {
      finish();
      return;
    }
    setStep((value) => Math.min(STEPS.length - 1, value + 1));
  }

  function finish() {
    if (!terms || !accepted) {
      setShowError(true);
      return;
    }
    completeOnboarding(terms.version);
    navigate('/', { replace: true });
  }

  return (
    <div className="dk-screen">
      <div className="dk-screen__body">
        <div className={styles.wizard}>
          <div
            className={styles.progressDots}
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={step + 1}
            aria-label={t('onboarding.progress', { current: step + 1, total: STEPS.length })}
          >
            {STEPS.map((id, index) => (
              <span key={id} className={styles.progressDot} data-active={index <= step} />
            ))}
          </div>

          <div className={styles.wizardContent}>
            {current === 'welcome' && (
              <div className={styles.brand}>
                <span className={styles.brandMark}>
                  <Navigation size={30} aria-hidden />
                </span>
                <h1 className={`${styles.title} ${styles.titleCentered}`}>{t('app.name')}</h1>
                <p className={`${styles.lead} ${styles.leadCentered}`}>{t('onboarding.intro')}</p>
              </div>
            )}

            {current === 'how' && (
              <Card>
                <h2 className={styles.title}>{t('onboarding.howTitle')}</h2>
                <p className={styles.lead}>{t('onboarding.howIntro')}</p>
                <ol className={styles.howList}>
                  {HOW_STEPS.map(({ key, icon: Icon }) => (
                    <li key={key} className={styles.howStep}>
                      <span className={styles.howStepIcon}>
                        <Icon size={22} aria-hidden />
                      </span>
                      <span className={styles.howStepText}>
                        <span className={styles.howStepTitle}>
                          {t(`onboarding.steps.${key}.title`)}
                        </span>
                        <span className={styles.howStepBody}>
                          {t(`onboarding.steps.${key}.body`)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>
            )}

            {current === 'data' && (
              <Card>
                <h2 className={styles.title}>{t('onboarding.dataTitle')}</h2>
                <p className={styles.promise}>
                  <BookOpenCheck size={20} className={styles.promiseIcon} aria-hidden />
                  {t('onboarding.dataSource')}
                </p>
                <p className={styles.promise}>
                  <ShieldCheck size={20} className={styles.promiseIcon} aria-hidden />
                  {t('onboarding.notRabbi')}
                </p>
                <p className={styles.promise}>
                  <ShieldCheck size={20} className={styles.promiseIcon} aria-hidden />
                  {t('onboarding.privacy')}
                </p>
              </Card>
            )}

            {current === 'stringency' && (
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
            )}

            {current === 'terms' && (
              <Card>
                <h2 className={styles.title}>{terms?.title || t('onboarding.termsTitle')}</h2>
                {terms ? (
                  <div className={`${styles.terms} ${styles.termsTall}`}>
                    {termsBody ? (
                      /* The document is authored in Markdown on the server. */
                      <Markdown source={termsBody} />
                    ) : (
                      t('onboarding.termsEmpty')
                    )}
                  </div>
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
                  disabled={!terms}
                />
                {showError && (
                  <p role="alert" className={styles.choiceHint}>
                    {t('onboarding.mustAccept')}
                  </p>
                )}
                {/* The full documents open in their own tab, so the wizard keeps its place. */}
                <LegalLinks />
              </Card>
            )}
          </div>

          <div className={styles.wizardFooter}>
            {step > 0 && (
              <Button variant="outline" size="large" onClick={goBack}>
                {t('onboarding.back')}
              </Button>
            )}
            <Button
              size="large"
              block
              onClick={goNext}
              disabled={isLast && !terms}
            >
              {step === 0
                ? t('onboarding.getStarted')
                : isLast
                  ? t('onboarding.start')
                  : t('onboarding.next')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
