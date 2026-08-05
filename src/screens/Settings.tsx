import type { Language, Stringency, ThemePreference } from '@dk/shared';
import { Check, ChevronLeft, FileText, ShieldCheck, Star, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button, Card, CardTitle, ListItem, Select, Switch } from '@/components/ui';
import { env } from '@/env';
import { useAuth } from '@/state/AuthProvider';
import { usePreferences } from '@/state/PreferencesProvider';

import styles from './screens.module.css';

const LEVELS: Stringency[] = ['basic', 'taharat', 'machmirim'];
const LEVEL_HINT: Record<Stringency, string> = {
  basic: 'stringency.basicDescription',
  taharat: 'stringency.taharatDescription',
  machmirim: 'stringency.machmiritDescription',
};

export function Settings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { preferences, update } = usePreferences();
  const { user, logout } = useAuth();

  return (
    <div className="dk-screen">
      <ScreenHeader title={t('settings.title')} backTo="/" />
      <div className="dk-screen__body">
        {env.mock && <span className={styles.mockBanner}>{t('settings.mockBanner')}</span>}

        <Card>
          <CardTitle>{t('stringency.label')}</CardTitle>
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
          <Select<Language>
            label={t('settings.language')}
            value={preferences.language}
            onValueChange={(language) => update({ language })}
            options={[
              { value: 'he', label: t('settings.languageHe') },
              { value: 'en', label: t('settings.languageEn') },
            ]}
          />
          <Select<ThemePreference>
            label={t('settings.theme')}
            value={preferences.theme}
            onValueChange={(theme) => update({ theme })}
            options={[
              { value: 'system', label: t('settings.themeSystem') },
              { value: 'light', label: t('settings.themeLight') },
              { value: 'dark', label: t('settings.themeDark') },
            ]}
          />
        </Card>

        <Card>
          <Switch
            checked={preferences.trafficAware}
            onCheckedChange={(trafficAware) => update({ trafficAware })}
            label={t('settings.traffic')}
            description={t('settings.trafficDescription')}
          />
          <Switch
            checked={preferences.avoidTolls}
            onCheckedChange={(avoidTolls) => update({ avoidTolls })}
            label={t('settings.toll')}
            description={t('settings.tollDescription')}
          />
          <Switch
            checked={preferences.avoidDangerZones}
            onCheckedChange={(avoidDangerZones) => update({ avoidDangerZones })}
            label={t('settings.dangerZones')}
            description={t('settings.dangerZonesDescription')}
          />
          <Switch
            checked={preferences.voiceEnabled}
            onCheckedChange={(voiceEnabled) => update({ voiceEnabled })}
            label={t('settings.voice')}
            description={t('settings.voiceDescription')}
          />
        </Card>

        <Card>
          <ListItem
            leading={<Star size={20} aria-hidden />}
            title={t('settings.savedPlaces')}
            trailing={<ChevronLeft size={18} aria-hidden />}
            onClick={() => navigate('/saved')}
          />
        </Card>

        <Card>
          <CardTitle>{t('settings.legal')}</CardTitle>
          <ListItem
            leading={<FileText size={20} aria-hidden />}
            title={t('legal.termsTitle')}
            trailing={<ChevronLeft size={18} aria-hidden />}
            onClick={() => navigate('/terms')}
          />
          <ListItem
            leading={<ShieldCheck size={20} aria-hidden />}
            title={t('legal.privacyTitle')}
            trailing={<ChevronLeft size={18} aria-hidden />}
            onClick={() => navigate('/privacy')}
          />
          <ListItem
            leading={<Trash2 size={20} aria-hidden />}
            title={t('legal.deleteAccountAction')}
            trailing={<ChevronLeft size={18} aria-hidden />}
            onClick={() => navigate('/delete-account')}
          />
        </Card>

        <Card>
          <CardTitle>{t('settings.account')}</CardTitle>
          {user ? (
            <>
              <p className={styles.choiceHint}>{user.displayName ?? user.email}</p>
              <Button variant="outline" onClick={() => void logout()}>
                {t('settings.logout')}
              </Button>
            </>
          ) : (
            <>
              <p className={styles.choiceHint}>{t('settings.loginPrompt')}</p>
              <Button onClick={() => navigate('/login')}>{t('auth.login')}</Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
