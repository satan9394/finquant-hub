import { Alert, Button, Descriptions, Empty, List, Modal, Space, Tag, Typography } from 'antd';

import type { SharePreview } from '../types/research';
import { useLanguage } from '../i18n/LanguageContext';

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
  const { t } = useLanguage();
  const content = preview?.content;
  return (
    <Modal
      title={t('strategy.share.title')}
      open={open}
      footer={<Button autoFocus onClick={onClose}>{t('strategy.share.close')}</Button>}
      onCancel={onClose}
      width={760}
      destroyOnHidden
    >
      <Space direction="vertical" size={14} style={{ width: '100%', overflowWrap: 'anywhere' }}>
        <Alert
          type="warning"
          showIcon
          message={t('strategy.share.privateMessage')}
          description={t('strategy.share.privateDescription')}
        />
        {loading ? <Alert type="info" showIcon message={t('strategy.share.loading')} /> : null}
        {error ? (
          <Alert
            type="error"
            showIcon
            message={t('strategy.share.failed')}
            description={error}
            action={<Button size="small" onClick={onRetry}>{t('strategy.share.retry')}</Button>}
          />
        ) : null}
        {!loading && !error && !preview ? <Empty description={t('strategy.share.empty')} /> : null}
        {preview ? (
          <>
            <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label={t('strategy.share.object')}>{preview.object.title}</Descriptions.Item>
              <Descriptions.Item label={t('strategy.share.subject')}>{preview.object.subject_id}</Descriptions.Item>
              <Descriptions.Item label={t('strategy.share.resultKind')}><Tag>{content?.result_kind}</Tag></Descriptions.Item>
              <Descriptions.Item label={t('strategy.share.causalProof')}>{t('strategy.share.no')}</Descriptions.Item>
              <Descriptions.Item label={t('strategy.share.quality')}><Tag>{preview.audit.quality.status}</Tag></Descriptions.Item>
              <Descriptions.Item label={t('strategy.share.license')}><Tag>{preview.audit.license.status}</Tag></Descriptions.Item>
              <Descriptions.Item label={t('strategy.share.freshness')}><Tag>{preview.audit.freshness.status}</Tag></Descriptions.Item>
              <Descriptions.Item label={t('strategy.share.redaction')}><Tag color={preview.audit.redaction.status === 'PASS' ? 'green' : 'red'}>{preview.audit.redaction.status}</Tag> {t('strategy.share.redactionCount', { count: preview.audit.redaction.redacted_count })}</Descriptions.Item>
            </Descriptions>

            <section>
              <Title level={5}>{t(content?.result_kind === 'USER_HYPOTHESIS' ? 'strategy.share.hypothesis' : 'strategy.share.result')}</Title>
              {content?.judgment ? <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{content.judgment}</Paragraph> : null}
              {content?.confidence != null ? <Text>{t('strategy.share.confidence', { value: content.confidence })}</Text> : null}
              {content?.assumptions?.length ? <List size="small" header={t('strategy.share.assumptions')} dataSource={content.assumptions} renderItem={(item) => <List.Item>{item}</List.Item>} /> : null}
              {content?.claims?.length ? <List size="small" header={t('strategy.share.claims')} dataSource={content.claims} renderItem={(item) => <List.Item>{item}</List.Item>} /> : null}
              {content?.invalidation_conditions?.length ? <List size="small" header={t('strategy.share.invalidations')} dataSource={content.invalidation_conditions} renderItem={(item) => <List.Item>{item}</List.Item>} /> : null}
              {content?.method ? <Paragraph>{t('strategy.share.method')}{content.method}</Paragraph> : null}
              {content?.parameters ? <Paragraph>{t('strategy.share.parameters')}{jsonValue(content.parameters)}</Paragraph> : null}
              {content?.metrics ? <Paragraph>{t('strategy.share.metrics')}{jsonValue(content.metrics)}</Paragraph> : null}
            </section>

            {preview.evidence ? (
              <List
                size="small"
                header={t('strategy.share.evidenceHeader', { count: preview.evidence.length })}
                dataSource={preview.evidence}
                locale={{ emptyText: t('strategy.share.evidenceEmpty') }}
                renderItem={(item) => (
                  <List.Item>
                    <Space direction="vertical" size={2}>
                      <Space wrap><Tag>{item.relation}</Tag><Tag>{item.data_status}</Tag><Text code>{item.evidence_id}</Text></Space>
                      <Text type="secondary">{t('strategy.share.sourceLine', { source: item.source || 'UNKNOWN', vendor: item.vendor || 'UNKNOWN', asOf: item.as_of || 'UNKNOWN', retrieved: item.retrieved_at || 'UNKNOWN' })}</Text>
                      <Text type="secondary">{t('strategy.share.licenseLine', { license: item.license_scope || 'UNKNOWN', reuse: t(item.public_reuse_permitted ? 'strategy.share.reuseAllowed' : 'strategy.share.reuseDenied'), quality: item.quality_flags.join(', ') || 'OK' })}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            ) : null}
            {preview.provenance ? (
              <Descriptions size="small" title={t('strategy.share.provenance')} bordered column={{ xs: 1, sm: 2 }}>
                <Descriptions.Item label="Provider">{preview.provenance.provider || 'UNKNOWN'}</Descriptions.Item>
                <Descriptions.Item label="As-of">{preview.provenance.as_of || 'UNKNOWN'}</Descriptions.Item>
                <Descriptions.Item label={t('strategy.share.scope')}>{[preview.provenance.currency, preview.provenance.adjustment, preview.provenance.frequency].filter(Boolean).join(' / ') || 'UNKNOWN'}</Descriptions.Item>
                <Descriptions.Item label="License">{preview.provenance.license_scope || 'UNKNOWN'}</Descriptions.Item>
              </Descriptions>
            ) : null}

            <Alert
              type="error"
              showIcon
              message={t('strategy.share.publicGate', { status: preview.publication_gate.status })}
              description={`${preview.publication_gate.reasons.join(' · ')}。${preview.publication_gate.requires}`}
            />
            <Alert type="info" showIcon message={t('strategy.share.disclaimer')} description={preview.audit.disclaimer.text} />
          </>
        ) : null}
      </Space>
    </Modal>
  );
}
