import { Drawer, Empty } from 'antd';
import EvidenceCard, { type EvidenceCardData } from './EvidenceCard';
import { useLanguage } from '../i18n/LanguageContext';

export default function EvidenceRail({ open, evidence, onClose, onAdd }: { open: boolean; evidence: EvidenceCardData | null; onClose: () => void; onAdd?: () => void }) {
  const { t } = useLanguage();
  return (
    <Drawer
      title={evidence ? `${t('evidence.source')} #${evidence.id}` : t('evidence.source')}
      open={open}
      onClose={onClose}
      width={400}
      // Astra B3：暗色 token 定义在 .app-theme--dark 内，而 Drawer 默认把内容
      // portal 到 document.body（脱离主题子树）。把抽屉挂回 .app-theme 内，
      // 自定义 CSS 才能继承当前明暗 token，避免与 AntD 暗色算法混搭。
      getContainer={() => document.querySelector<HTMLElement>('.app-theme') ?? document.body}
    >
      {evidence ? <EvidenceCard evidence={evidence} onAdd={onAdd} /> : <Empty description="UNKNOWN" />}
    </Drawer>
  );
}
