import { Button, Card, Col, Empty, Row, Space, Tag, Typography } from 'antd';
import RoleAvatar from './RoleAvatar';
import EvidenceChip from './EvidenceChip';
import type { EvidenceRecord } from './EvidenceDrawer';
import { useLanguage } from '../i18n/LanguageContext';

export interface CommitteeMember {
  key: string;
  name: string;
  role: string;
  status: 'waiting' | 'running' | 'completed' | 'failed';
  position?: '看多' | '中性' | '看空';
  summary?: string;
  evidence?: EvidenceRecord[];
}

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
  const completed = members.filter((member) => member.status === 'completed' && member.position);
  const positionCounts = completed.reduce<Record<string, number>>((counts, member) => ({ ...counts, [member.position!]: (counts[member.position!] ?? 0) + 1 }), {});
  const leadingPosition = Object.entries(positionCounts).sort((left, right) => right[1] - left[1])[0];
  const unresolved = members.filter((member) => member.status === 'waiting' || member.status === 'failed');
  const hasConflict = completed.some((member) => member.position === '看多') && completed.some((member) => member.position === '看空');
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
              <section><h3>{t('committee.consensus')}</h3><p>{leadingPosition ? t('committee.consensusSummary', { count: leadingPosition[1], total: completed.length, position: positionLabel(leadingPosition[0] as CommitteeMember['position']) }) : 'UNKNOWN'}</p></section>
              <section><h3>{t('committee.disagreement')}</h3>{completed.length ? completed.map((member) => <p key={member.key}><strong>{member.name} · {positionLabel(member.position)}</strong> {member.summary || 'UNKNOWN'}</p>) : <p>UNKNOWN</p>}</section>
              <section><h3>{t('committee.unresolved')}</h3><p>{unresolved.length ? unresolved.map((member) => `${member.name}: ${memberStatus(member.status)}`).join(t('committee.separator')) : 'UNKNOWN'}</p></section>
              <section><h3>{t('committee.conflict')}</h3><p>{hasConflict ? t('committee.conflictPresent') : 'UNKNOWN'}</p>{hasConflict ? completed.flatMap((member) => member.evidence ?? []).map((evidence, index) => <EvidenceChip key={evidence.id || index} evidence={evidence} />) : null}</section>
            </div>
          </Card>
        </Col>
      </Row>
    </section>
  );
}
