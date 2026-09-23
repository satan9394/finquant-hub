import { Alert } from 'antd';
import EventTimeline from './EventTimeline';
import { useLanguage } from '../i18n/LanguageContext';

export default function PortfolioEvents() {
  const { t } = useLanguage();
  return <>
    <Alert type="info" showIcon message={t('portfolio.eventsUnavailable')} description={t('portfolio.eventsDescription')} />
    <EventTimeline events={[]} />
  </>;
}
