import { Button, Card, Col, Row, Tag, Typography } from 'antd';
import { FileSearchOutlined, MessageOutlined, TeamOutlined } from '@ant-design/icons';

import { RESEARCH_INTENTS, researchIntentPath, type ResearchIntent } from '../../features/researchIntent';
import { useLanguage } from '../../i18n/LanguageContext';

const { Paragraph, Text } = Typography;

const icons: Record<ResearchIntent, React.ReactNode> = {
  quick: <MessageOutlined />,
  deep: <FileSearchOutlined />,
  review: <TeamOutlined />,
};

export default function ResearchIntentPicker({ symbol, onNavigate }: { symbol: string; onNavigate: (path: string) => void }) {
  const { lang, t } = useLanguage();
  return (
    <Card title={t('research.intent.title')} className="surface-card research-intent-picker">
      <Row gutter={[12, 12]}>
        {RESEARCH_INTENTS.map((intent) => {
          const title = t(`research.intent.${intent.key}.title`);
          return <Col xs={24} lg={8} key={intent.key}>
            <Card size="small" className="research-intent-card">
              <div className="research-intent-card__title">{icons[intent.key]} <Text strong>{title}</Text></div>
              <Paragraph>{t(`research.intent.${intent.key}.purpose`)}</Paragraph>
              <div><Tag>{t('research.intent.output')}</Tag>{t(`research.intent.${intent.key}.output`)}</div>
              <div><Tag>{t('research.intent.duration')}</Tag>{t(`research.intent.${intent.key}.duration`)}</div>
              <div><Tag color="gold">{t('research.intent.budget')}</Tag>{t(`research.intent.${intent.key}.budget`)}</div>
              <Text type="secondary">{t('research.intent.finalAction', { value: t(`research.intent.${intent.key}.finalAction`) })}</Text>
              <Button block type={intent.key === 'deep' ? 'primary' : 'default'} aria-label={t('research.intent.select', { title })} onClick={() => onNavigate(researchIntentPath(intent.key, symbol, lang))}>
                {t('research.intent.select', { title })}
              </Button>
            </Card>
          </Col>;
        })}
      </Row>
      <Text type="secondary">{t('research.intent.notice')}</Text>
    </Card>
  );
}
