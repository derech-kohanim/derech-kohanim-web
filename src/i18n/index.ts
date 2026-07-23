import type { Language } from '@dk/shared';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import he from './locales/he.json';

export const SUPPORTED_LANGUAGES: Language[] = ['he', 'en'];

const DIRECTION: Record<Language, 'rtl' | 'ltr'> = { he: 'rtl', en: 'ltr' };
const STORAGE_KEY = 'dk.language';

function isLanguage(value: string | null): value is Language {
  return value === 'he' || value === 'en';
}

function initialLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (isLanguage(stored)) return stored;
  return navigator.language.startsWith('en') ? 'en' : 'he';
}

/** Flipping <html dir> is what turns the whole layout around, not just the strings. */
export function applyDirection(language: string): void {
  const lang: Language = isLanguage(language) ? language : 'he';
  document.documentElement.lang = lang;
  document.documentElement.dir = DIRECTION[lang];
  localStorage.setItem(STORAGE_KEY, lang);
}

void i18n.use(initReactI18next).init({
  resources: { he: { translation: he }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: 'he',
  interpolation: { escapeValue: false },
});

applyDirection(i18n.language);
i18n.on('languageChanged', applyDirection);

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : 'he';
}

export default i18n;
