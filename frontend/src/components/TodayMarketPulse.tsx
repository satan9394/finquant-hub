import type { ReactNode } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export default function TodayMarketPulse({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  return <section className="today-section"><h2>{t('today.marketPulse')}</h2>{children}</section>;
}
