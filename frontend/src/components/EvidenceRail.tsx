import { Drawer, Empty } from 'antd';
import EvidenceCard, { type EvidenceCardData } from './EvidenceCard';
import { useLanguage } from '../i18n/LanguageContext';

export default function EvidenceRail({ open, evidence, onClose, onAdd }: { open: boolean; evidence: EvidenceCardData | null; onClose: () => void; onAdd?: () => void }) {
  const { t } = useLanguage();
  return (
    <Drawer title={evidence ? `${t('evidence.source')} #${evidence.id}` : t('evidence.source')} open={open} onClose={onClose} width={400}>
      {evidence ? <EvidenceCard evidence={evidence} onAdd={onAdd} /> : <Empty description="UNKNOWN" />}
    </Drawer>
  );
}
