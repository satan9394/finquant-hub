import { EyeOutlined, RadarChartOutlined, SwapOutlined } from '@ant-design/icons';
import ActionBar from './ActionBar';
import SourceChip from './SourceChip';
import StatusChip from './StatusChip';
import { useLanguage } from '../i18n/LanguageContext';

interface EntityHeaderProps {
  name: string;
  ticker: string;
  market?: string | null;
  industry?: string | null;
  price?: string | null;
  change?: string | null;
  changeTone?: 'up' | 'down' | 'neutral';
  asOf?: string | null;
  provider?: string | null;
  onWatch: () => void;
  onMonitor: () => void;
  onCompare: () => void;
}

export default function EntityHeader(props: EntityHeaderProps) {
  const { t } = useLanguage();
  return (
    <header className="entity-header">
      <div className="entity-header__identity">
        <span className="entity-header__eyebrow">{t('entity.eyebrow')}</span>
        <h1>{props.name}</h1>
        <div className="entity-header__meta">
          <span>{props.ticker.toUpperCase()}</span>
          <span>{props.market || 'UNKNOWN'}</span>
          <span>{props.industry || 'UNKNOWN'}</span>
          <SourceChip provider={props.provider} asOf={props.asOf} />
        </div>
      </div>
      <div className="entity-header__market">
        <strong>{props.price || 'UNKNOWN'}</strong>
        <StatusChip label={props.change || 'UNKNOWN'} tone={props.changeTone === 'up' ? 'error' : props.changeTone === 'down' ? 'success' : 'neutral'} />
        <small>{t('entity.updated')}: {props.asOf || 'UNKNOWN'}</small>
      </div>
      <ActionBar actions={[
        { key: 'watch', label: t('entity.watch'), icon: <EyeOutlined />, onClick: props.onWatch },
        { key: 'monitor', label: t('entity.monitor'), icon: <RadarChartOutlined />, onClick: props.onMonitor },
        { key: 'compare', label: t('entity.compare'), icon: <SwapOutlined />, onClick: props.onCompare },
      ]} />
    </header>
  );
}
