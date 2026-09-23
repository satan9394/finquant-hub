import en from './en';
import zh from './zh';

export type Language = 'zh' | 'en';

export const LANGUAGE_STORAGE_KEY = 'finquant_lang';
export const translations: Record<Language, Record<string, string>> = { zh, en };

export function detectLanguage(): Language {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved === 'zh' || saved === 'en') return saved;
  return 'zh';
}

export function translate(lang: Language, key: string, values?: Record<string, string | number>): string {
  const template = translations[lang][key] ?? translations.zh[key] ?? key;
  if (!values) return template;
  return Object.entries(values).reduce(
    (result, [name, value]) => result.split(`{${name}}`).join(String(value)),
    template,
  );
}
