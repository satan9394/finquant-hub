import { Button, Card, Col, Row, Tag, Typography } from 'antd';
import { FileSearchOutlined, MessageOutlined, TeamOutlined } from '@ant-design/icons';

import { RESEARCH_INTENTS, researchIntentPath, type ResearchIntent } from '../../features/researchIntent';

const { Paragraph, Text } = Typography;

const icons: Record<ResearchIntent, React.ReactNode> = {
  quick: <MessageOutlined />,
  deep: <FileSearchOutlined />,
  review: <TeamOutlined />,
};

export default function ResearchIntentPicker({ symbol, onNavigate }: { symbol: string; onNavigate: (path: string) => void }) {
  return (
    <Card title="选择 AI 研究方式" className="surface-card research-intent-picker">
      <Row gutter={[12, 12]}>
        {RESEARCH_INTENTS.map((intent) => (
          <Col xs={24} lg={8} key={intent.key}>
            <Card size="small" className="research-intent-card">
              <div className="research-intent-card__title">{icons[intent.key]} <Text strong>{intent.title}</Text></div>
              <Paragraph>{intent.purpose}</Paragraph>
              <div><Tag>产物</Tag>{intent.output}</div>
              <div><Tag>耗时</Tag>{intent.duration}</div>
              <div><Tag color="gold">额度</Tag>{intent.budget}</div>
              <Text type="secondary">最终确认：{intent.finalAction}</Text>
              <Button block type={intent.key === 'deep' ? 'primary' : 'default'} aria-label={`选择${intent.title}`} onClick={() => onNavigate(researchIntentPath(intent.key, symbol))}>
                选择{intent.title}
              </Button>
            </Card>
          </Col>
        ))}
      </Row>
      <Text type="secondary">选择这里只导航和预填；不会自动调用模型、创建记录或开始任务。</Text>
    </Card>
  );
}
