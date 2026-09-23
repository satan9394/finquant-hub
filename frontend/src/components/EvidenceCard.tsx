import { Button } from 'antd';
import SourceChip from './SourceChip';
import { useLanguage } from '../i18n/LanguageContext';

export interface EvidenceCardData {
  id: number;
  title: string;
  sourceType?: string | null;
  authority?: string | null;
  publisher?: string | null;
  publishedAt?: string | null;
  page?: string | number | null;
  excerpt?: string | null;
  url?: string | null;
  confidence?: string | number | null;
  provider?: string | null;
}

export default function EvidenceCard({ evidence, onAdd }: { evidence: EvidenceCardData; onAdd?: () => void }) {
  const { t } = useLanguage();
  return (
    <article className="evidence-card">
      <div className="evidence-card__topline"><strong>#{evidence.id} {evidence.title}</strong><SourceChip provider={evidence.provider || evidence.publisher} asOf={evidence.publishedAt} quality={String(evidence.confidence ?? 'UNKNOWN')} /></div>
      <dl>
        <div><dt>{t('evidence.type')}</dt><dd>{evidence.sourceType || 'UNKNOWN'}</dd></div>
        <div><dt>{t('evidence.authority')}</dt><dd>{evidence.authority || 'UNKNOWN'}</dd></div>
        <div><dt>{t('evidence.page')}</dt><dd>{evidence.page ?? 'UNKNOWN'}</dd></div>
      </dl>
      <blockquote>{evidence.excerpt || 'UNKNOWN'}</blockquote>
      <div className="evidence-card__actions">
        <Button href={evidence.url || undefined} target={evidence.url ? '_blank' : undefined} disabled={!evidence.url}>{t('evidence.openDocument')}</Button>
        <Button disabled={!onAdd} onClick={onAdd}>{t('evidence.addThesis')}</Button>
      </div>
    </article>
  );
}
