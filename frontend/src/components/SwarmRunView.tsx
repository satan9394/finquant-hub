/* ============================================================
 * SwarmRunView —— 一份 `SwarmRunState` 的**唯一**渲染段（W3 新增）
 *
 * 为什么要单独一个文件：Mission 3 / W3 要求"回放态与实时态共用同一套渲染"。
 * 实时路径（`SwarmStatusCard` 消费 SSE，经 `features/swarm/state.ts#applySwarmEvent` 折叠）
 * 与历史回放路径（`features/swarm/replay.ts#replaySwarmRun` 折叠落库事件）产出的都是
 * **同一种值** `SwarmRunState`。本组件只认这个值，不认它是怎么来的 ⇒
 * 进度条、统计数字、状态标签、Agent 卡片、输出折叠、`data-testid` 全部**只有一份**，
 * 文案来源（`research.swarm.status.*` 等）也只有一处。
 *
 * 项目铁律「同一件事的两条路径必须同源」在这里的落点就是：**别处不得再写第二份
 * Agent 卡片 / 进度 / 状态标签渲染**。要加字段，改这里。
 * ============================================================ */

import { useMemo } from 'react';
import {
  Alert, Button, Card, Col, Collapse, Progress, Row, Space, Statistic, Tag, Typography,
} from 'antd';
import RoleAvatar from './RoleAvatar';
import {
  swarmProgress,
  swarmToolCalls,
  type SwarmAgentStatus,
  type SwarmRunState,
} from '../features/swarm/state';
import { useLanguage } from '../i18n/LanguageContext';
import { describeDegradedReasons } from '../features/degradedReasons';

const { Paragraph, Text } = Typography;

/** 状态标签的**唯一**呈现表（色 + 文案键）。回放与实时共用，不得各写一份。 */
const STATUS_PRESENTATION: Record<SwarmAgentStatus, { label: string; color: string }> = {
  pending: { label: 'pending', color: 'default' },
  running: { label: 'running', color: 'processing' },
  completed: { label: 'completed', color: 'success' },
  failed: { label: 'failed', color: 'error' },
  skipped: { label: 'skipped', color: 'warning' },
  cancelled: { label: 'cancelled', color: 'default' },
};

export default function SwarmRunView({ run, ticker }: { run: SwarmRunState; ticker: string }) {
  const { t } = useLanguage();
  const agents = useMemo(() => Object.values(run.agents), [run]);
  const progress = swarmProgress(run);
  const toolCalls = swarmToolCalls(run);
  const completedAgents = agents.filter((agent) => agent.status === 'completed').length;
  const progressStatus = run.status === 'failed'
    ? 'exception'
    : run.status === 'completed' ? 'success' : 'active';

  return (
    <div data-testid="swarm-run-view">
      <div aria-live="polite">
        <Progress percent={progress} status={progressStatus} />
      </div>

      <Row gutter={[12, 12]} style={{ margin: '8px 0 16px' }}>
        <Col xs={8}><Statistic title={t('research.swarm.completedAgents')} value={completedAgents} suffix={`/ ${agents.length}`} /></Col>
        <Col xs={8}><Statistic title={t('research.swarm.toolCalls')} value={toolCalls} /></Col>
        <Col xs={8}><Statistic title={t('research.swarm.tokens')} value={run.totalTokens} /></Col>
      </Row>

      {run.error ? <Alert type="error" showIcon message={run.error} style={{ marginBottom: 12 }} /> : null}
      {run.reportId && (run.status === 'completed' || run.status === 'partial') ? (
        <Alert
          type={run.status === 'completed' ? 'success' : 'warning'}
          showIcon
          message={t('research.swarm.reportSaved', { id: run.reportId })}
          action={<Button size="small" href={`/research/reports?symbol=${encodeURIComponent(ticker)}`}>{t('research.swarm.viewReport')}</Button>}
          style={{ marginBottom: 12 }}
        />
      ) : null}

      <Row gutter={[12, 12]}>
        {agents.map((agent) => {
          const presentation = STATUS_PRESENTATION[agent.status];
          return (
            <Col xs={24} sm={12} xl={6} key={agent.key}>
              <Card size="small" data-testid={`swarm-agent-${agent.key}`} style={{ height: '100%' }}>
                <Space align="start">
                  <RoleAvatar avatar={agent.avatar} name={agent.key} pulsing={agent.status === 'running'} />
                  <div>
                    <Text strong>{agent.name}</Text><br />
                    <Tag color={presentation.color} style={{ marginTop: 6 }}>{t(`research.swarm.status.${presentation.label}`)}</Tag>
                  </div>
                </Space>
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary">{t('research.swarm.agentUsage', { calls: agent.toolCalls, tokens: agent.tokenCount })}</Text><br />
                  <Text type="secondary">
                    {agent.dependencies.length > 0 ? t('research.swarm.dependencies', { count: agent.dependencies.length }) : t('research.swarm.independent')}
                  </Text>
                  {agent.error ? <Paragraph type="danger" style={{ margin: '8px 0 0' }}>{agent.error}</Paragraph> : null}
                  {/* VS-35：结构化 status === 'degraded' ⇒ 产出在、过程有残缺。
                      不得把它渲染成干净的"完成"；原因码缺失时如实显示"原因未记录"。 */}
                  {agent.degraded ? (
                    <Paragraph type="warning" style={{ margin: '8px 0 0' }}>
                      {describeDegradedReasons(agent.degradedReasons ?? [], t) ?? t('deep.agent.reasonUnrecorded')}
                    </Paragraph>
                  ) : null}
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>

      {agents.some((agent) => agent.content) ? (
        <Collapse
          style={{ marginTop: 16 }}
          items={agents.filter((agent) => agent.content).map((agent) => ({
            key: agent.key,
            label: `${agent.avatar} ${agent.name} · ${agent.tokenCount} tokens`,
            children: <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{agent.content}</Paragraph>,
          }))}
        />
      ) : null}
      <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
        {t('research.swarm.outputBoundary')}
      </Text>
    </div>
  );
}
