import { Button, Card, Col, Empty, Row, Space, Tag, Typography } from 'antd';
import RoleAvatar from './RoleAvatar';
import EvidenceChip from './EvidenceChip';
import type { EvidenceRecord } from './EvidenceDrawer';
import { useLanguage } from '../i18n/LanguageContext';
import type { DiscussionStreamingEntry } from '../features/discussionStream';

export interface CommitteeMember {
  key: string;
  name: string;
  role: string;
  status: 'waiting' | 'running' | 'completed' | 'failed';
  position?: '看多' | '中性' | '看空';
  summary?: string;
  evidence?: EvidenceRecord[];
  streaming?: DiscussionStreamingEntry;
}

type CommitteePosition = NonNullable<CommitteeMember['position']>;
const committeePositions: CommitteePosition[] = ['看多', '中性', '看空'];

export default function InvestmentCommittee({
  topic,
  members,
  phase = 'agenda-draft',
  onConfirm,
}: {
  topic: string;
  members: CommitteeMember[];
  phase?: 'agenda-draft' | 'awaiting-confirmation' | 'in-session' | 'voting' | 'completed' | 'partial';
  onConfirm?: () => void;
}) {
  const { t } = useLanguage();
  const phaseLabel: Record<typeof phase, string> = {
    'agenda-draft': t('committee.phase.agenda'), 'awaiting-confirmation': t('committee.phase.awaiting'), 'in-session': t('committee.phase.session'),
    voting: t('committee.phase.voting'), completed: t('committee.phase.completed'), partial: t('committee.phase.partial'),
  };
  const memberStatus = (status: CommitteeMember['status']) => t(`committee.member.${status}`);
  const positionLabel = (position: CommitteeMember['position']) => position ? t(`committee.position.${position}`) : 'UNKNOWN';
  const completed = members.filter((member) => member.status === 'completed');
  const positionedCompleted = completed.filter((member) => member.position !== undefined);
  const positionCounts = positionedCompleted.reduce<Partial<Record<CommitteePosition, number>>>((counts, member) => {
    const position = member.position;
    if (position) counts[position] = (counts[position] ?? 0) + 1;
    return counts;
  }, {});
  const leadingPosition = committeePositions
    .map((position) => ({ position, count: positionCounts[position] ?? 0 }))
    .filter(({ count }) => count > 0)
    .sort((left, right) => right.count - left.count)[0];
  const unresolved = members.filter((member) => member.status === 'waiting' || member.status === 'failed');
  const hasConflict = (positionCounts['看多'] ?? 0) > 0 && (positionCounts['看空'] ?? 0) > 0;
  const streamingMembers = members.flatMap((member) => member.streaming ? [{ member, streaming: member.streaming }] : []);
  return (
    <section className="investment-committee" aria-label={t('committee.aria')}>
      <Card className="investment-committee__agenda" size="small">
        <div>
          <Typography.Text className="eyebrow">{t('committee.eyebrow')}</Typography.Text>
          <Typography.Title level={4}>{topic}</Typography.Title>
          <Typography.Text type="secondary">{t('committee.description')}</Typography.Text>
        </div>
        <Space wrap>
          <Tag color={phase === 'completed' ? 'green' : phase === 'partial' ? 'gold' : 'processing'}>{phaseLabel[phase]}</Tag>
          {onConfirm && (phase === 'agenda-draft' || phase === 'awaiting-confirmation') ? <Button type="primary" onClick={onConfirm}>{t('committee.confirm')}</Button> : null}
        </Space>
      </Card>
      <Row gutter={[12, 12]} className="investment-committee__body">
        <Col xs={24} md={7} xl={5}>
          <Card size="small" title={t('committee.roleRail')}>
            <div className="investment-committee__rail">
              {members.map((member) => (
                <div className="investment-committee__member" key={member.key}>
                  <RoleAvatar name={member.key} size="small" />
                  <div><Typography.Text strong>{member.name}</Typography.Text><Typography.Text type="secondary">{member.role}</Typography.Text></div>
                  <Tag>{memberStatus(member.status)}</Tag>
                </div>
              ))}
              {!members.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('committee.noMembers')} /> : null}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={17} xl={19}>
          <Card size="small" title={t('committee.output')} className="investment-committee__timeline">
            <div className="review-summary">
              <section><h3>{t('committee.consensus')}</h3><p>{leadingPosition ? t('committee.consensusSummary', { count: leadingPosition.count, total: positionedCompleted.length, position: positionLabel(leadingPosition.position) }) : 'UNKNOWN'}</p></section>
              <section><h3>{t('committee.disagreement')}</h3>{completed.length ? completed.map((member) => <p key={member.key}><strong>{member.name} · {positionLabel(member.position)}</strong> {member.summary || 'UNKNOWN'}</p>) : <p>UNKNOWN</p>}</section>
              <section><h3>{t('committee.unresolved')}</h3><p>{unresolved.length ? unresolved.map((member) => `${member.name}: ${memberStatus(member.status)}`).join(t('committee.separator')) : 'UNKNOWN'}</p></section>
              <section><h3>{t('committee.conflict')}</h3><p>{hasConflict ? t('committee.conflictPresent') : 'UNKNOWN'}</p>{hasConflict ? completed.flatMap((member) => member.evidence ?? []).map((evidence, index) => <EvidenceChip key={evidence.id || index} evidence={evidence} />) : null}</section>
            </div>
            {streamingMembers.length ? (
              <section className="investment-committee__stream" aria-label={t('committee.stream.title')} aria-live="polite">
                <h3>{t('committee.stream.title')}</h3>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {streamingMembers.map(({ member, streaming }) => {
                    return (
                      <article key={member.key} className={`investment-committee__stream-item investment-committee__stream-item--${streaming.status}`}>
                        <Space wrap size={6}>
                          <Typography.Text strong>{member.name}</Typography.Text>
                          <Tag>{t('committee.stream.round', { round: streaming.round })}</Tag>
                          <Tag color={streaming.status === 'running' ? 'processing' : streaming.status === 'completed' ? 'success' : 'error'}>
                            {t(`committee.stream.${streaming.status}`)}
                          </Tag>
                        </Space>
                        <Typography.Paragraph style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>
                          {streaming.content || (streaming.status === 'running' ? t('committee.stream.waiting') : 'UNKNOWN')}
                        </Typography.Paragraph>
                      </article>
                    );
                  })}
                </Space>
              </section>
            ) : null}
          </Card>
        </Col>
      </Row>
    </section>
  );
}
