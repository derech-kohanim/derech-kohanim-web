import { useEffect, useState, type ReactNode } from 'react';
import type { Language, Stringency, ThemePreference } from '@dk/shared';
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronLeft,
  Database,
  FileText,
  Globe,
  Info,
  Layers,
  LogIn,
  LogOut,
  Mail,
  Phone,
  PlayCircle,
  RotateCcw,
  Route as RouteIcon,
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

import appIcon from '@/assets/images/app-icon.png';
import developerLogo from '@/assets/images/developer-abaye.webp';
import { api } from '@/api';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button, Dialog, Select, Switch, useToast } from '@/components/ui';
import { env } from '@/env';
import { currentLanguage } from '@/i18n';
import { useAuth } from '@/state/AuthProvider';
import { usePreferences } from '@/state/PreferencesProvider';
import { useTrip } from '@/state/TripProvider';
import { TAHARAT_EMAIL, TAHARAT_PHONE } from '@/lib/contacts';
import { VoiceSettings } from '@/voice/VoiceSettings';
import { resetTours } from '@/tour/Tour';

import styles from './screens.module.css';

const LEVELS: Stringency[] = ['basic', 'taharat', 'machmirim'];
const LEVEL_HINT: Record<Stringency, string> = {
  basic: 'stringency.basicDescription',
  taharat: 'stringency.taharatDescription',
  machmirim: 'stringency.machmiritDescription',
};

/** The settings categories, in menu order. Each one is its own sub-screen. */
const SECTIONS = ['avoidance', 'voice', 'display', 'data', 'account', 'guide', 'about'] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_ICON: Record<Section, typeof Shield> = {
  avoidance: Shield,
  voice: Volume2,
  display: MapIcon,
  data: Database,
  account: User,
  guide: BookOpen,
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
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    void api
      .savedPlaces()
      .then((places) => setSavedCount(places.length))
      .catch(() => undefined);
  }, [user]);

  const summary: Record<Section, string> = {
    avoidance: t(`stringency.${preferences.stringency}`),
    voice: preferences.voiceEnabled ? t('settings.voiceOnSummary') : t('settings.voiceOffSummary'),
    display: `${t(preferences.language === 'he' ? 'settings.languageHe' : 'settings.languageEn')} · ${t(
      `settings.theme${preferences.theme[0].toUpperCase()}${preferences.theme.slice(1)}`,
    )}`,
    data: t('settings.dataSummary'),
    account: user ? (user.displayName ?? user.email ?? '') : t('settings.guestSummary'),
    guide: t('settings.guideSummary'),
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
            const row = (
              <NavRow
                key={section}
                icon={<Icon size={18} aria-hidden />}
                title={t(`settings.section.${section}`)}
                subtitle={summary[section]}
                onClick={() => navigate(`/settings/${section}`)}
              />
            );
            // Saved places is a destination of its own, listed just above the guide.
            return section === 'guide'
              ? [
                  <NavRow
                    key="saved"
                    icon={<Star size={18} aria-hidden />}
                    title={t('settings.savedPlaces')}
                    subtitle={
                      user
                        ? savedCount === null
                          ? t('saved.homeWorkAndMore')
                          : t('saved.count', { count: savedCount })
                        : t('saved.needsAccount')
                    }
                    onClick={() => navigate('/saved')}
                  />,
                  row,
                ]
              : row;
          })}
        </Group>

        {/* The zone authority, set apart and pinned to the bottom so it is always in reach. */}
        <aside className={styles.taharatCard} aria-labelledby="taharat-title">
          <span className={styles.taharatIcon} aria-hidden>
            <Phone size={20} />
          </span>
          <div className={styles.taharatText}>
            <h2 id="taharat-title" className={styles.taharatTitle}>
              {t('settings.taharatContact')}
            </h2>
            <p className={styles.taharatBody}>{t('settings.taharatContactSummary')}</p>
            <div className={styles.taharatActions}>
              <a className={styles.taharatButton} href={`tel:${TAHARAT_PHONE.replace(/-/g, '')}`}>
                <Phone size={16} aria-hidden />
                <bdi dir="ltr">{TAHARAT_PHONE}</bdi>
              </a>
              <a className={styles.taharatButtonOutline} href={`mailto:${TAHARAT_EMAIL}`}>
                <Mail size={16} aria-hidden />
                <bdi dir="ltr">{TAHARAT_EMAIL}</bdi>
              </a>
            </div>
          </div>
        </aside>
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
        {current === 'guide' && <GuideSection />}
        {current === 'about' && <AboutSection />}
      </div>
    </div>
  );
}

function AvoidanceSection() {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <Group title={t('stringency.label')}>
        <NavRow
          icon={<Shield size={18} aria-hidden />}
          title={t(`stringency.${preferences.stringency}`)}
          subtitle={t(LEVEL_HINT[preferences.stringency])}
          onClick={() => setPickerOpen(true)}
        />
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

      <StringencyDialog open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}

/**
 * The avoidance level is chosen in its own dialog: the choice is a draft until Save, and saving
 * a less strict level than the current one asks once more before it applies.
 */
export function StringencyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();
  const [draft, setDraft] = useState<Stringency>(preferences.stringency);
  const [confirmLower, setConfirmLower] = useState(false);

  // Each opening starts from the saved level.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(preferences.stringency);
      setConfirmLower(false);
    }
  }

  const lowering = LEVELS.indexOf(draft) < LEVELS.indexOf(preferences.stringency);

  function save() {
    if (draft === preferences.stringency) {
      onClose();
      return;
    }
    if (lowering && !confirmLower) {
      setConfirmLower(true);
      return;
    }
    update({ stringency: draft });
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={confirmLower ? t('settings.lowerLevelTitle') : t('settings.chooseLevelTitle')}
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => (confirmLower ? setConfirmLower(false) : onClose())}
          >
            {confirmLower ? t('common.back') : t('common.cancel')}
          </Button>
          <Button onClick={save}>
            {confirmLower ? t('settings.lowerLevelConfirm') : t('common.save')}
          </Button>
        </>
      }
    >
      {confirmLower ? (
        <p className={styles.dialogBody}>
          {t('settings.lowerLevelBody', {
            from: t(`stringency.${preferences.stringency}`),
            to: t(`stringency.${draft}`),
          })}
        </p>
      ) : (
        <div className={styles.settingsGroup} role="radiogroup" aria-label={t('stringency.label')}>
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={draft === level}
              className={styles.settingsRow}
              data-selected={draft === level}
              onClick={() => setDraft(level)}
            >
              <span className={styles.settingsRadio} aria-hidden />
              <span className={styles.actionText}>
                {t(`stringency.${level}`)}
                <span className={styles.actionSubtitle}>{t(LEVEL_HINT[level])}</span>
              </span>
              {draft === level && <Check size={18} aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </Dialog>
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
        <img className={styles.aboutLogo} src={appIcon} alt="" />
        <h2 className={styles.aboutName}>{t('app.name')}</h2>
        {/* Isolated left to right, or "0.1.0" reads backwards in Hebrew. */}
        <span className={styles.aboutVersion}>
          {t('settings.version')} <bdi dir="ltr">{__APP_VERSION__}</bdi>
        </span>
        <p className={styles.aboutTagline}>{t('settings.aboutTagline')}</p>
      </div>

      <div className={styles.developerCard}>
        <img className={styles.developerLogo} src={developerLogo} alt="abaye" />
        <span className={styles.developerName}>{t('settings.developedBy')}</span>
        <a
          className={styles.developerSite}
          href="https://abaye.co"
          target="_blank"
          rel="noreferrer"
        >
          <Globe size={16} aria-hidden />
          <bdi dir="ltr">abaye.co</bdi>
        </a>
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

const TIPS: { key: string; icon: typeof Shield }[] = [
  { key: 'zone', icon: Shield },
  { key: 'legend', icon: Layers },
  { key: 'simulate', icon: PlayCircle },
  { key: 'voice', icon: Volume2 },
  { key: 'noClean', icon: AlertTriangle },
  { key: 'account', icon: User },
  { key: 'offline', icon: RouteIcon },
];

/** Guide and tips: replay the tours, and every tip in one list. */
function GuideSection() {
  const { t } = useTranslation();
  const toast = useToast();
  return (
    <>
      <Group>
        <NavRow
          icon={<RotateCcw size={18} aria-hidden />}
          title={t('settings.guideReplay')}
          subtitle={t('settings.guideReplayHint')}
          onClick={() => {
            resetTours();
            toast.show(t('settings.guideReplayDone'), 'info');
          }}
        />
      </Group>
      <Group title={t('settings.tipsTitle')}>
        {TIPS.map(({ key, icon: Icon }) => (
          <div key={key} className={styles.settingsRow}>
            <span className={styles.actionChip}>
              <Icon size={18} aria-hidden />
            </span>
            <span className={styles.actionText}>
              {t(`settings.tips.${key}.title`)}
              <span className={styles.actionSubtitle}>{t(`settings.tips.${key}.body`)}</span>
            </span>
          </div>
        ))}
      </Group>
    </>
  );
}
