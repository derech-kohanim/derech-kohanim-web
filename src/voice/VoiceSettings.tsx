import { useTranslation } from 'react-i18next';

import { Select, Switch } from '@/components/ui';
import { usePreferences } from '@/state/PreferencesProvider';

import { voiceGender, voiceIdFor, type VoiceGender } from './voiceId';

/**
 * The voice on/off switch and, for Hebrew, the male/female voice picker. Shared by the
 * settings screen and the in-drive voice dialog (long press on the mute button), so both
 * change the same preferences.
 */
export function VoiceSettings() {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();

  return (
    <>
      <Switch
        checked={preferences.voiceEnabled}
        onCheckedChange={(voiceEnabled) => update({ voiceEnabled })}
        label={t('settings.voice')}
        description={t('settings.voiceDescription')}
      />
      {preferences.language === 'he' && (
        <Select<VoiceGender>
          label={t('settings.voiceId')}
          hint={t('settings.voiceIdDescription')}
          value={voiceGender(preferences.voiceId)}
          onValueChange={(gender) => update({ voiceId: voiceIdFor(gender, 'he') })}
          options={[
            { value: 'male', label: t('settings.voiceMale') },
            { value: 'female', label: t('settings.voiceFemale') },
          ]}
        />
      )}
    </>
  );
}
