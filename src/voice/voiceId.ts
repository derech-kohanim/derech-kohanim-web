import type { Language } from '@dk/shared';

export type VoiceGender = 'male' | 'female';

/**
 * The speaker's voice: the server synthesizes the he-male and he-female packs with a male and a
 * female voice. The wording is the same in both, addressed to the driver in the masculine.
 * `he-default`, stored before the choice existed, is the male voice.
 */
export function voiceGender(voiceId: string): VoiceGender {
  return voiceId === 'he-female' ? 'female' : 'male';
}

/** The voice id to store for a picked gender. English has a single voice. */
export function voiceIdFor(gender: VoiceGender, language: Language): string {
  if (language === 'en') return 'en-default';
  return gender === 'female' ? 'he-female' : 'he-male';
}
