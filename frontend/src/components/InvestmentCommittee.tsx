import { Button, Card, Col, Empty, Row, Space, Tag, Typography } from 'antd';
import RoleAvatar from './RoleAvatar';
import EvidenceChip from './EvidenceChip';
import ResearchArtifact from './ResearchArtifact';
import type { EvidenceRecord } from './EvidenceDrawer';

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
  const phaseLabel: Record<typeof phase, string> = {
    'agenda-draft': '议程草稿', 'awaiting-confirmation': '等待确认', 'in-session': '会议进行中',
    voting: '投票中', completed: '已完成', partial: '部分完成',
  };
  return (
    <section className="investment-committee" aria-label="AI 投资委员会">
      <Card className="investment-committee__agenda" size="small">
        <div>
          <Typography.Text className="eyebrow">INVESTMENT COMMITTEE</Typography.Text>
          <Typography.Title level={4}>{topic}</Typography.Title>
          <Typography.Text type="secondary">会议输出是研究 Artifact；投票不会触发组合动作。</Typography.Text>
        </div>
        <Space wrap>
          <Tag color={phase === 'completed' ? 'green' : phase === 'partial' ? 'gold' : 'processing'}>{phaseLabel[phase]}</Tag>
          {onConfirm && (phase === 'agenda-draft' || phase === 'awaiting-confirmation') ? <Button type="primary" onClick={onConfirm}>确认开会</Button> : null}
        </Space>
      </Card>
      <Row gutter={[12, 12]} className="investment-committee__body">
        <Col xs={24} md={7} xl={5}>
          <Card size="small" title="角色 Rail">
            <div className="investment-committee__rail">
              {members.map((member) => (
                <div className="investment-committee__member" key={member.key}>
                  <RoleAvatar name={member.key} size="small" />
                  <div><Typography.Text strong>{member.name}</Typography.Text><Typography.Text type="secondary">{member.role}</Typography.Text></div>
                  <Tag>{member.status === 'completed' ? '完成' : member.status === 'running' ? '分析中' : member.status === 'failed' ? '失败' : '等待'}</Tag>
                </div>
              ))}
              {!members.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未安排角色" /> : null}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={17} xl={19}>
          <Card size="small" title="观点与反驳" className="investment-committee__timeline">
            {members.map((member) => (
              <article className="investment-committee__opinion" key={member.key}>
                <Space><Typography.Text strong>{member.name}</Typography.Text>{member.position ? <Tag>{member.position}</Tag> : null}</Space>
                <Typography.Paragraph>{member.summary || '等待该角色完成观点整理。'}</Typography.Paragraph>
                {member.evidence?.length ? <div>{member.evidence.map((evidence, index) => <EvidenceChip key={evidence.id || index} evidence={evidence} />)}</div> : null}
              </article>
            ))}
            {phase === 'completed' || phase === 'partial' ? (
              <ResearchArtifact type="Research Report" state={phase === 'partial' ? 'partial' : 'ready'} title="主席总结" summary="共识、分歧、关键前提与使结论失效的条件需要单独复核。" />
            ) : null}
          </Card>
        </Col>
      </Row>
    </section>
  );
}
