import { useState, type ReactNode } from 'react';
import type { Language, Stringency, ThemePreference } from '@dk/shared';
import {
  Check,
  ChevronLeft,
  Database,
  FileText,
  Info,
  LogIn,
  LogOut,
  Map as MapIcon,
  Shield,
  ShieldCheck,
  Star,
  Trash2,
  User,
  Volume2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button, Dialog, Select, Switch } from '@/components/ui';
import { env } from '@/env';
import { currentLanguage } from '@/i18n';
import { useAuth } from '@/state/AuthProvider';
import { usePreferences } from '@/state/PreferencesProvider';
import { useTrip } from '@/state/TripProvider';
import { VoiceSettings } from '@/voice/VoiceSettings';

import styles from './screens.module.css';

const LEVELS: Stringency[] = ['basic', 'taharat', 'machmirim'];
const LEVEL_HINT: Record<Stringency, string> = {
  basic: 'stringency.basicDescription',
  taharat: 'stringency.taharatDescription',
  machmirim: 'stringency.machmiritDescription',
};

/** The settings categories, in menu order. Each one is its own sub-screen. */
const SECTIONS = ['avoidance', 'voice', 'display', 'data', 'account', 'about'] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_ICON: Record<Section, typeof Shield> = {
  avoidance: Shield,
  voice: Volume2,
  display: MapIcon,
  data: Database,
  account: User,
  about: Info,
};

/** A Civic grouped list: one hairline-bordered box with rows separated by hairlines. */
function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className={styles.settingsGroupWrap}>
      {title && <h2 className={styles.settingsGroupTitle}>{title}</h2>}
      <div className={styles.settingsGroup}>{children}</div>
    </section>
  );
}

/** A tappable row that opens a sub-screen or a document. */
function NavRow({
  icon,
  title,
  subtitle,
  tone,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  tone?: 'danger';
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.settingsRow} onClick={onClick}>
      <span className={styles.actionChip} data-tone={tone}>
        {icon}
      </span>
      <span className={styles.actionText}>
        {title}
        {subtitle && <span className={styles.actionSubtitle}>{subtitle}</span>}
      </span>
      <ChevronLeft size={16} className={styles.actionChevron} aria-hidden />
    </button>
  );
}

/** The settings home: a menu of categories with the current value of each underneath. */
export function Settings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { preferences } = usePreferences();
  const { user } = useAuth();

  const summary: Record<Section, string> = {
    avoidance: t(`stringency.${preferences.stringency}`),
    voice: preferences.voiceEnabled ? t('settings.voiceOnSummary') : t('settings.voiceOffSummary'),
    display: `${t(preferences.language === 'he' ? 'settings.languageHe' : 'settings.languageEn')} · ${t(
      `settings.theme${preferences.theme[0].toUpperCase()}${preferences.theme.slice(1)}`,
    )}`,
    data: t('settings.dataSummary'),
    account: user ? (user.displayName ?? user.email ?? '') : t('settings.guestSummary'),
    about: t('settings.aboutSummary'),
  };

  return (
    <div className="dk-screen">
      <ScreenHeader title={t('settings.title')} backTo="/" />
      <div className="dk-screen__body">
        {env.mock && <span className={styles.mockBanner}>{t('settings.mockBanner')}</span>}
        <Group>
          {SECTIONS.map((section) => {
            const Icon = SECTION_ICON[section];
            return (
              <NavRow
                key={section}
                icon={<Icon size={18} aria-hidden />}
                title={t(`settings.section.${section}`)}
                subtitle={summary[section]}
                onClick={() => navigate(`/settings/${section}`)}
              />
            );
          })}
        </Group>
      </div>
    </div>
  );
}

/** One settings category, addressed as /settings/:section. */
export function SettingsSection() {
  const { section } = useParams<{ section: string }>();
  const { t } = useTranslation();

  if (!section || !(SECTIONS as readonly string[]).includes(section)) {
    return <Navigate to="/settings" replace />;
  }
  const current = section as Section;

  return (
    <div className="dk-screen">
      <ScreenHeader title={t(`settings.section.${current}`)} backTo="/settings" />
      <div className="dk-screen__body">
        {current === 'avoidance' && <AvoidanceSection />}
        {current === 'voice' && <VoiceSection />}
        {current === 'display' && <DisplaySection />}
        {current === 'data' && <DataSection />}
        {current === 'account' && <AccountSection />}
        {current === 'about' && <AboutSection />}
      </div>
    </div>
  );
}

function AvoidanceSection() {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();
  // Lowering the level shows more of the map as drivable, so it is confirmed first.
  const [pending, setPending] = useState<Stringency | null>(null);

  function choose(level: Stringency) {
    if (level === preferences.stringency) return;
    if (LEVELS.indexOf(level) < LEVELS.indexOf(preferences.stringency)) {
      setPending(level);
      return;
    }
    update({ stringency: level });
  }

  return (
    <>
      <Group title={t('stringency.label')}>
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            className={styles.settingsRow}
            data-selected={preferences.stringency === level}
            aria-pressed={preferences.stringency === level}
            onClick={() => choose(level)}
          >
            <span className={styles.settingsRadio} aria-hidden />
            <span className={styles.actionText}>
              {t(`stringency.${level}`)}
              <span className={styles.actionSubtitle}>{t(LEVEL_HINT[level])}</span>
            </span>
            {preferences.stringency === level && <Check size={18} aria-hidden />}
          </button>
        ))}
      </Group>

      <Group title={t('settings.routeOptions')}>
        <div className={styles.settingsSwitchRow}>
          <Switch
            checked={preferences.avoidDangerZones}
            onCheckedChange={(avoidDangerZones) => update({ avoidDangerZones })}
            label={t('settings.dangerZones')}
            description={t('settings.dangerZonesDescription')}
          />
        </div>
        <div className={styles.settingsSwitchRow}>
          <Switch
            checked={preferences.avoidTolls}
            onCheckedChange={(avoidTolls) => update({ avoidTolls })}
            label={t('settings.toll')}
            description={t('settings.tollDescription')}
          />
        </div>
        <div className={styles.settingsSwitchRow}>
          <Switch
            checked={preferences.trafficAware}
            onCheckedChange={(trafficAware) => update({ trafficAware })}
            label={t('settings.traffic')}
            description={t('settings.trafficDescription')}
          />
        </div>
      </Group>

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={t('settings.lowerLevelTitle')}
        actions={
          <>
            <Button variant="outline" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (pending) update({ stringency: pending });
                setPending(null);
              }}
            >
              {t('settings.lowerLevelConfirm')}
            </Button>
          </>
        }
      >
        <p className={styles.dialogBody}>
          {pending &&
            t('settings.lowerLevelBody', {
              from: t(`stringency.${preferences.stringency}`),
              to: t(`stringency.${pending}`),
            })}
        </p>
      </Dialog>
    </>
  );
}

function VoiceSection() {
  return (
    <div className={styles.settingsGroup}>
      <div className={styles.settingsSwitchRow}>
        <VoiceSettings />
      </div>
    </div>
  );
}

function DisplaySection() {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();
  return (
    <div className={styles.settingsGroup}>
      <div className={styles.settingsSwitchRow}>
        <Select<Language>
          label={t('settings.language')}
          value={preferences.language}
          onValueChange={(language) => update({ language })}
          options={[
            { value: 'he', label: t('settings.languageHe') },
            { value: 'en', label: t('settings.languageEn') },
          ]}
        />
      </div>
      <div className={styles.settingsSwitchRow}>
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
      </div>
    </div>
  );
}

function DataSection() {
  const { t } = useTranslation();
  const { zones, zonesLoadedAt, dangerZones } = useTrip();
  const time = zonesLoadedAt
    ? new Intl.DateTimeFormat(currentLanguage() === 'en' ? 'en-GB' : 'he-IL', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(zonesLoadedAt)
    : null;

  return (
    <Group title={t('settings.zoneLayers')}>
      <div className={styles.settingsInfoRow}>
        <span>{t('settings.zonesUpdated')}</span>
        <span className={styles.settingsInfoValue}>{time ?? t('settings.zonesNotLoaded')}</span>
      </div>
      <div className={styles.settingsInfoRow}>
        <span>{t('settings.zoneCount')}</span>
        <span className={styles.settingsInfoValue}>{zones?.features.length ?? 0}</span>
      </div>
      <div className={styles.settingsInfoRow}>
        <span>{t('settings.dangerZoneCount')}</span>
        <span className={styles.settingsInfoValue}>{dangerZones?.features.length ?? 0}</span>
      </div>
      <p className={styles.settingsNote}>{t('settings.zonesNote')}</p>
    </Group>
  );
}

function AccountSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [confirmLogout, setConfirmLogout] = useState(false);

  return (
    <>
      <Group>
        {user ? (
          <div className={styles.settingsInfoRow}>
            <span className={styles.actionText}>
              {user.displayName ?? user.email}
              {user.displayName && user.email && (
                <span className={styles.actionSubtitle}>{user.email}</span>
              )}
            </span>
          </div>
        ) : (
          <NavRow
            icon={<LogIn size={18} aria-hidden />}
            title={t('auth.login')}
            subtitle={t('settings.loginPrompt')}
            onClick={() => navigate('/login')}
          />
        )}
        <NavRow
          icon={<Star size={18} aria-hidden />}
          title={t('settings.savedPlaces')}
          onClick={() => navigate('/saved')}
        />
      </Group>

      {user && (
        <Group>
          <NavRow
            icon={<LogOut size={18} aria-hidden />}
            title={t('settings.logout')}
            onClick={() => setConfirmLogout(true)}
          />
          <NavRow
            icon={<Trash2 size={18} aria-hidden />}
            title={t('legal.deleteAccountAction')}
            tone="danger"
            onClick={() => navigate('/delete-account')}
          />
        </Group>
      )}

      <Dialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title={t('settings.logoutTitle')}
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirmLogout(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                setConfirmLogout(false);
                void logout();
              }}
            >
              {t('settings.logout')}
            </Button>
          </>
        }
      >
        <p className={styles.dialogBody}>{t('settings.logoutBody')}</p>
      </Dialog>
    </>
  );
}

/** About: the app, its version, who made it, and the legal documents. */
function AboutSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <>
      <div className={styles.aboutHero}>
        <span className={styles.aboutLogo} aria-hidden>
          <ShieldCheck size={44} />
        </span>
        <h2 className={styles.aboutName}>{t('app.name')}</h2>
        {/* Isolated left to right, or "0.1.0" reads backwards in Hebrew. */}
        <span className={styles.aboutVersion}>
          {t('settings.version')} <bdi dir="ltr">{__APP_VERSION__}</bdi>
        </span>
        <p className={styles.aboutTagline}>{t('settings.aboutTagline')}</p>
      </div>

      <Group>
        <NavRow
          icon={<FileText size={18} aria-hidden />}
          title={t('legal.termsTitle')}
          onClick={() => navigate('/terms')}
        />
        <NavRow
          icon={<ShieldCheck size={18} aria-hidden />}
          title={t('legal.privacyTitle')}
          onClick={() => navigate('/privacy')}
        />
      </Group>

      <Group>
        <div className={styles.settingsInfoRow}>
          <span>{t('settings.openSource')}</span>
          <a
            className={styles.settingsLink}
            href="https://github.com/derech-kohanim"
            target="_blank"
            rel="noreferrer"
          >
            <bdi dir="ltr">github.com/derech-kohanim</bdi>
          </a>
        </div>
        {env.contactEmail && (
          <div className={styles.settingsInfoRow}>
            <span>{t('legal.contactTitle')}</span>
            <a className={styles.settingsLink} href={`mailto:${env.contactEmail}`}>
              <bdi dir="ltr">{env.contactEmail}</bdi>
            </a>
          </div>
        )}
        <p className={styles.settingsNote}>{t('settings.zoneDataCredit')}</p>
      </Group>
    </>
  );
}
