import { Button } from 'antd';
import { useLanguage } from '../i18n/LanguageContext';

export default function TodayUniverse({ onOpen }: { onOpen: (path: string) => void }) {
  const { t } = useLanguage();
  const items = [
    { key: 'portfolio', path: '/portfolio' },
    { key: 'watchlist', path: '/research' },
    { key: 'ipo', path: '/alerts?type=ipo' },
    { key: 'themes', path: '/discover' },
  ];
  return <section className="today-section"><div className="section-heading"><h2>{t('today.universe.title')}</h2></div><div className="today-universe-grid">{items.map((item) => <Button key={item.key} onClick={() => onOpen(item.path)}><span>{t(`today.universe.${item.key}`)}</span><strong>UNKNOWN</strong></Button>)}</div></section>;
}
