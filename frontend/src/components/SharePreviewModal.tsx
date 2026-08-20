import { Alert, Button, Descriptions, Empty, List, Modal, Space, Tag, Typography } from 'antd';

import type { SharePreview } from '../types/research';

const { Paragraph, Text, Title } = Typography;

interface Props {
  open: boolean;
  loading: boolean;
  error: string;
  preview: SharePreview | null;
  onClose: () => void;
  onRetry: () => void;
}

const jsonValue = (value: unknown) => (
  <Text style={{ overflowWrap: 'anywhere' }}>{JSON.stringify(value, null, 2)}</Text>
);

export default function SharePreviewModal({ open, loading, error, preview, onClose, onRetry }: Props) {
  const content = preview?.content;
  return (
    <Modal
      title="私有分享预览 · 未发布"
      open={open}
      footer={<Button autoFocus onClick={onClose}>关闭</Button>}
      onCancel={onClose}
      width={760}
      destroyOnHidden
    >
      <Space direction="vertical" size={14} style={{ width: '100%', overflowWrap: 'anywhere' }}>
        <Alert
          type="warning"
          showIcon
          message="仅当前登录用户可见；没有创建公开链接、分享令牌或发布记录。"
          description="此处没有发布、复制或发送动作。公开分享仍由 AIOS-071 的隐私、数据许可和法律决策阻塞。"
        />
        {loading ? <Alert type="info" showIcon message="正在生成私有预览" /> : null}
        {error ? (
          <Alert
            type="error"
            showIcon
            message="私有预览生成失败"
            description={error}
            action={<Button size="small" onClick={onRetry}>重试</Button>}
          />
        ) : null}
        {!loading && !error && !preview ? <Empty description="暂无可预览内容" /> : null}
        {preview ? (
          <>
            <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="对象">{preview.object.title}</Descriptions.Item>
              <Descriptions.Item label="标的">{preview.object.subject_id}</Descriptions.Item>
              <Descriptions.Item label="内容类型"><Tag>{content?.result_kind}</Tag></Descriptions.Item>
              <Descriptions.Item label="因果证明">否</Descriptions.Item>
              <Descriptions.Item label="质量"><Tag>{preview.audit.quality.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="许可"><Tag>{preview.audit.license.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="时效"><Tag>{preview.audit.freshness.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="脱敏"><Tag color={preview.audit.redaction.status === 'PASS' ? 'green' : 'red'}>{preview.audit.redaction.status}</Tag> {preview.audit.redaction.redacted_count} 处</Descriptions.Item>
            </Descriptions>

            <section>
              <Title level={5}>{content?.result_kind === 'USER_HYPOTHESIS' ? '用户假设' : '计算结果'}</Title>
              {content?.judgment ? <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{content.judgment}</Paragraph> : null}
              {content?.confidence != null ? <Text>置信度：{content.confidence}</Text> : null}
              {content?.assumptions?.length ? <List size="small" header="假设" dataSource={content.assumptions} renderItem={(item) => <List.Item>{item}</List.Item>} /> : null}
              {content?.claims?.length ? <List size="small" header="论点" dataSource={content.claims} renderItem={(item) => <List.Item>{item}</List.Item>} /> : null}
              {content?.invalidation_conditions?.length ? <List size="small" header="失效条件" dataSource={content.invalidation_conditions} renderItem={(item) => <List.Item>{item}</List.Item>} /> : null}
              {content?.method ? <Paragraph>方法：{content.method}</Paragraph> : null}
              {content?.parameters ? <Paragraph>参数：{jsonValue(content.parameters)}</Paragraph> : null}
              {content?.metrics ? <Paragraph>有限指标：{jsonValue(content.metrics)}</Paragraph> : null}
            </section>

            {preview.evidence ? (
              <List
                size="small"
                header={`Canonical evidence metadata（${preview.evidence.length}）`}
                dataSource={preview.evidence}
                locale={{ emptyText: 'UNKNOWN：当前版本没有 canonical evidence 引用' }}
                renderItem={(item) => (
                  <List.Item>
                    <Space direction="vertical" size={2}>
                      <Space wrap><Tag>{item.relation}</Tag><Tag>{item.data_status}</Tag><Text code>{item.evidence_id}</Text></Space>
                      <Text type="secondary">来源：{item.source || 'UNKNOWN'} / {item.vendor || 'UNKNOWN'} · as-of {item.as_of || 'UNKNOWN'} · retrieved {item.retrieved_at || 'UNKNOWN'}</Text>
                      <Text type="secondary">许可：{item.license_scope || 'UNKNOWN'} · 公开复用：{item.public_reuse_permitted ? '明确允许' : '未获许可'} · 质量：{item.quality_flags.join(', ') || 'OK'}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            ) : null}
            {preview.provenance ? (
              <Descriptions size="small" title="Persisted provenance" bordered column={{ xs: 1, sm: 2 }}>
                <Descriptions.Item label="Provider">{preview.provenance.provider || 'UNKNOWN'}</Descriptions.Item>
                <Descriptions.Item label="As-of">{preview.provenance.as_of || 'UNKNOWN'}</Descriptions.Item>
                <Descriptions.Item label="口径">{[preview.provenance.currency, preview.provenance.adjustment, preview.provenance.frequency].filter(Boolean).join(' / ') || 'UNKNOWN'}</Descriptions.Item>
                <Descriptions.Item label="License">{preview.provenance.license_scope || 'UNKNOWN'}</Descriptions.Item>
              </Descriptions>
            ) : null}

            <Alert
              type="error"
              showIcon
              message={`公开门禁：${preview.publication_gate.status}`}
              description={`${preview.publication_gate.reasons.join(' · ')}。${preview.publication_gate.requires}`}
            />
            <Alert type="info" showIcon message="免责声明" description={preview.audit.disclaimer.text} />
          </>
        ) : null}
      </Space>
    </Modal>
  );
}
