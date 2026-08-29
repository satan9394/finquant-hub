import { Progress, Tag } from 'antd';
import { useLanguage } from '../i18n/LanguageContext';

export interface ThesisData {
  stance?: 'Bullish' | 'Neutral' | 'Bearish' | null;
  conviction?: number | null;
  core: string[];
  evidenceFor: Array<{ text: string; sourceRef?: number }>;
  evidenceAgainst: Array<{ text: string; sourceRef?: number }>;
  catalysts: string[];
  invalidationRules: string[];
  drift?: string | null;
  convictionChange?: string | null;
}

function thesisList(items: Array<string | { text: string; sourceRef?: number }>, onReference?: (id: number) => void) {
  if (!items.length) return <li>UNKNOWN</li>;
  return items.map((item, index) => {
    const value = typeof item === 'string' ? { text: item } : item;
    const sourceRef = 'sourceRef' in value ? value.sourceRef : undefined;
    return <li key={`${value.text}-${index}`}>{value.text}{sourceRef ? <button className="source-reference" onClick={() => onReference?.(sourceRef)}>[{sourceRef}]</button> : null}</li>;
  });
}

export default function ThesisBlock({ thesis, onReference }: { thesis: ThesisData; onReference?: (id: number) => void }) {
  const { t } = useLanguage();
  return (
    <section className="thesis-block">
      <div className="thesis-block__header">
        <div><span>{t('thesisBlock.stance')}</span><Tag>{thesis.stance || 'UNKNOWN'}</Tag></div>
        <div><span>{t('thesisBlock.conviction')}</span>{thesis.conviction == null ? <strong>UNKNOWN</strong> : <Progress percent={thesis.conviction} size="small" />}</div>
      </div>
      <div className="thesis-block__grid">
        <section><h3>{t('thesisBlock.core')}</h3><ol>{thesisList(thesis.core)}</ol></section>
        <section><h3>{t('thesisBlock.support')}</h3><ul>{thesisList(thesis.evidenceFor, onReference)}</ul></section>
        <section><h3>{t('thesisBlock.against')}</h3><ul>{thesisList(thesis.evidenceAgainst, onReference)}</ul></section>
        <section><h3>{t('thesisBlock.catalysts')}</h3><ul>{thesisList(thesis.catalysts)}</ul></section>
        <section><h3>{t('thesisBlock.invalidation')}</h3><ul>{thesisList(thesis.invalidationRules)}</ul></section>
        <section><h3>{t('thesisBlock.drift')}</h3><p>{thesis.drift || 'UNKNOWN'} · {thesis.convictionChange || 'UNKNOWN'}</p></section>
      </div>
    </section>
  );
}
