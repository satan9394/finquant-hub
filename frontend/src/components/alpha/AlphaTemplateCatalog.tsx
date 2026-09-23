import { Button, Card, Col, Collapse, Descriptions, Row, Space, Statistic, Tag, Typography } from 'antd';

import { explainAlphaCategory, explainAlphaTemplate, formatAlphaCoverage } from '../../features/alpha/catalog';
import type { AlphaCategory, AlphaTemplate } from '../../services/alphaApi';

const { Paragraph, Text } = Typography;

export default function AlphaTemplateCatalog({
  categories, templates, selectedId, onSelect,
}: {
  categories: AlphaCategory[];
  templates: AlphaTemplate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <Card title="1. 浏览真实字段类别" className="surface-card">
        <Text type="secondary">数量和示例来自当前打包字段目录，不代表任一标的或区域的可用覆盖。</Text>
        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          {categories.map((category) => {
            const explanation = explainAlphaCategory(category.name);
            return (
              <Col xs={24} md={8} xl={6} key={category.name}>
                <Card size="small" style={{ height: '100%' }} data-testid={`alpha-category-${category.name}`}>
                  <Statistic title={explanation.label} value={category.count.toLocaleString('en-US')} />
                  <Paragraph type="secondary" style={{ margin: '6px 0' }}>{explanation.description}</Paragraph>
                  <Text type="secondary">接口类别：{category.name}</Text>
                  <div style={{ marginTop: 6 }}>{category.examples.map((field) => (
                    <Tag key={field} style={{ maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{field}</Tag>
                  ))}</div>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Card>

      <Card title="2. 选择真实字段模板" className="surface-card" style={{ marginTop: 18 }}>
        <Text type="secondary">后端仅在表达式引用的每个字段都存在于打包目录时返回模板；选择只更新本地研究上下文。</Text>
        <Row gutter={[14, 14]} style={{ marginTop: 12 }}>
          {templates.map((template) => {
            const explanation = explainAlphaTemplate(template.id);
            const selected = selectedId === template.id;
            return (
              <Col xs={24} xl={12} key={template.id}>
                <Card size="small" style={{ height: '100%', borderColor: selected ? 'var(--fq-ai-primary)' : undefined }}>
                  <Space wrap><Text strong>{template.name}</Text><Tag color="blue">{explanation.category}</Tag><Tag color="green">目录字段已验证</Tag></Space>
                  <Paragraph style={{ margin: '10px 0 6px' }}>{explanation.hypothesis}</Paragraph>
                  <Paragraph type="secondary" style={{ marginBottom: 10 }}>主要局限：{explanation.limitation}</Paragraph>
                  <Text type="secondary">区域：接口未提供</Text>
                  <div style={{ marginTop: 10 }}>
                    {template.fields.map((field) => (
                      <Card size="small" key={field.id} style={{ marginBottom: 6 }}>
                        <Space wrap><Text code style={{ overflowWrap: 'anywhere' }}>{field.id}</Text><Tag>目录 coverage {formatAlphaCoverage(field.coverage)}</Tag></Space>
                        <div><Text type="secondary">{field.description || '接口未提供字段描述'}</Text></div>
                      </Card>
                    ))}
                  </div>
                  <Collapse
                    size="small"
                    items={[{
                      key: 'formula',
                      label: '表达式与设置',
                      children: (
                        <>
                          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12 }}>{template.expression}</pre>
                          <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
                            <Descriptions.Item label="中性化">{template.settings.neutralization}</Descriptions.Item>
                            <Descriptions.Item label="衰减">{template.settings.decay}</Descriptions.Item>
                            <Descriptions.Item label="延迟">{template.settings.delay}</Descriptions.Item>
                            <Descriptions.Item label="NaN 处理">{template.settings.nanHandling}</Descriptions.Item>
                          </Descriptions>
                        </>
                      ),
                    }]}
                  />
                  <Button
                    block
                    type={selected ? 'primary' : 'default'}
                    aria-label={selected ? `当前模板：${template.name}` : `选择${template.name}模板`}
                    style={{ marginTop: 10 }}
                    onClick={() => onSelect(template.id)}
                  >
                    {selected ? '当前模板' : '选择模板'}
                  </Button>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Card>
    </>
  );
}
