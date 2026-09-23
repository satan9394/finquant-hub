import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { detectLanguage, LANGUAGE_STORAGE_KEY, translate, type Language } from './index';

interface LanguageValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

const fallbackLanguage: LanguageValue = {
  lang: 'zh',
  setLang: () => undefined,
  t: (key, values) => translate('zh', key, values),
};

const LanguageContext = createContext<LanguageValue>(fallbackLanguage);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, updateLang] = useState<Language>(detectLanguage);
  const value = useMemo<LanguageValue>(() => ({
    lang,
    setLang: (next) => {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
      document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
      updateLang(next);
    },
    t: (key, values) => translate(lang, key, values),
  }), [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageValue {
  return useContext(LanguageContext);
}
