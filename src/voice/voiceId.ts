import type { Language } from '@dk/shared';

import type { Translate } from '@/lib/maneuver';

export type VoiceGender = 'male' | 'female';

/**
 * Hebrew instructions are gendered (פנה / פני), so the selected voice decides the grammatical
 * form of every spoken text as well as the synthesized voice. `he-default`, stored before the
 * choice existed, is the masculine voice.
 */
export function voiceGender(voiceId: string): VoiceGender {
  return voiceId === 'he-female' ? 'female' : 'male';
}

/** The voice id to store for a picked gender. English has a single voice. */
export function voiceIdFor(gender: VoiceGender, language: Language): string {
  if (language === 'en') return 'en-default';
  return gender === 'female' ? 'he-female' : 'he-male';
}

/**
 * Wraps `t` so spoken texts follow the voice's gender: a `voice.*` key is first looked up under
 * `voice.female.*` for the feminine voice, and falls back to the shared (masculine or
 * ungendered) text when no feminine override exists. Other keys pass straight through.
 */
export function voiceTranslator(t: Translate, gender: VoiceGender): Translate {
  if (gender === 'male') return t;
  return (key, options) => {
    if (key.startsWith('voice.') && !key.startsWith('voice.female.')) {
      const femaleKey = `voice.female.${key.slice('voice.'.length)}`;
      const translated = t(femaleKey, options);
      if (translated !== femaleKey) return translated;
    }
    return t(key, options);
  };
}
