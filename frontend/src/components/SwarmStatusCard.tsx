import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, Col, Collapse, Progress, Row, Segmented, Skeleton, Space, Statistic, Tag, Typography,
} from 'antd';
import { CloseCircleOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import RoleAvatar from './RoleAvatar';
import {
  applySwarmEvent,
  cancelSwarmRun,
  createSwarmRunState,
  swarmProgress,
  swarmToolCalls,
  type SwarmAgentStatus,
  type SwarmRunState,
  type SwarmTeamDefinition,
} from '../features/swarm/state';
import {
  fetchEarningsReviewTeam,
  fetchFourMastersTeam,
  streamEarningsReview,
  streamFourMasters,
} from '../services/swarmApi';
import { useModelStore } from '../store/modelStore';

const { Paragraph, Text } = Typography;

const STATUS_PRESENTATION: Record<SwarmAgentStatus, { label: string; color: string }> = {
  pending: { label: '等待', color: 'default' },
  running: { label: '分析中', color: 'processing' },
  completed: { label: '完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  skipped: { label: '已跳过', color: 'warning' },
  cancelled: { label: '已停止', color: 'default' },
};

interface SwarmStatusCardProps {
  ticker: string;
}

export default function SwarmStatusCard({ ticker }: SwarmStatusCardProps) {
  const currentModelId = useModelStore((state) => state.currentModelId);
  const [team, setTeam] = useState<SwarmTeamDefinition | null>(null);
  const [run, setRun] = useState<SwarmRunState | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [teamKind, setTeamKind] = useState<'four-masters' | 'earnings-review'>('four-masters');
  const abortRef = useRef<AbortController | null>(null);

  const loadTeam = useCallback(async () => {
    setLoadingTeam(true);
    setLoadError('');
    try {
      const definition = teamKind === 'four-masters'
        ? await fetchFourMastersTeam()
        : await fetchEarningsReviewTeam();
      setTeam(definition);
      setRun(createSwarmRunState(definition));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '团队定义加载失败');
    } finally {
      setLoadingTeam(false);
    }
  }, [teamKind]);

  useEffect(() => {
    void loadTeam();
    return () => abortRef.current?.abort();
  }, [loadTeam]);

  useEffect(() => {
    abortRef.current?.abort();
    if (team) setRun(createSwarmRunState(team));
  }, [team, ticker]);

  const start = useCallback(async () => {
    if (!team || run?.status === 'running') return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRun({ ...createSwarmRunState(team), status: 'running' });

    try {
      const streamTeam = teamKind === 'four-masters' ? streamFourMasters : streamEarningsReview;
      const terminal = await streamTeam(
        ticker,
        currentModelId,
        (event) => setRun((current) => current ? applySwarmEvent(current, event) : current),
        controller.signal,
      );
      if (!terminal && !controller.signal.aborted) {
        setRun((current) => current ? applySwarmEvent(current, {
          event: 'error',
          data: { error: 'Swarm 事件流在完成前中断' },
        }) : current);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setRun((current) => current ? cancelSwarmRun(current) : current);
      } else {
        const message = error instanceof Error ? error.message : 'Swarm 运行失败';
        setRun((current) => current ? applySwarmEvent(current, {
          event: 'error', data: { error: message },
        }) : current);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [currentModelId, run?.status, team, teamKind, ticker]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setRun((current) => current ? cancelSwarmRun(current) : current);
  }, []);

  const agents = useMemo(() => run ? Object.values(run.agents) : [], [run]);
  const progress = run ? swarmProgress(run) : 0;
  const toolCalls = run ? swarmToolCalls(run) : 0;
  const completedAgents = agents.filter((agent) => agent.status === 'completed').length;
  const progressStatus = run?.status === 'failed'
    ? 'exception'
    : run?.status === 'completed' ? 'success' : 'active';

  if (loadingTeam) {
    return <Card className="surface-card" style={{ marginBottom: 18 }}><Skeleton active paragraph={{ rows: 3 }} /></Card>;
  }
  if (!team || !run) {
    return (
      <Alert
        type="error"
        showIcon
        message="Swarm 团队加载失败"
        description={loadError}
        action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void loadTeam()}>重试</Button>}
        style={{ marginBottom: 18 }}
      />
    );
  }

  return (
    <Card
      className="surface-card"
      data-testid="swarm-status-card"
      style={{ marginBottom: 18 }}
      title={<Space><span>{team.name}</span><Tag>{ticker}</Tag><Tag color="purple">SWARM</Tag></Space>}
      extra={run.status === 'running'
        ? <Button danger icon={<CloseCircleOutlined />} onClick={stop}>停止</Button>
        : <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => void start()}>启动团队</Button>}
    >
      <Segmented
        value={teamKind}
        onChange={(value) => setTeamKind(value as 'four-masters' | 'earnings-review')}
        options={[
          { label: '四大师综合研究', value: 'four-masters' },
          { label: '财报精读', value: 'earnings-review' },
        ]}
        disabled={run.status === 'running'}
        style={{ marginBottom: 12 }}
      />
      <Paragraph type="secondary" style={{ marginTop: -4 }}>{team.description}</Paragraph>
      <div aria-live="polite">
        <Progress percent={progress} status={progressStatus} />
      </div>

      <Row gutter={[12, 12]} style={{ margin: '8px 0 16px' }}>
        <Col xs={8}><Statistic title="已完成 Agent" value={completedAgents} suffix={`/ ${agents.length}`} /></Col>
        <Col xs={8}><Statistic title="工具调用" value={toolCalls} /></Col>
        <Col xs={8}><Statistic title="估算 Tokens" value={run.totalTokens} /></Col>
      </Row>

      {run.error ? <Alert type="error" showIcon message={run.error} style={{ marginBottom: 12 }} /> : null}
      {run.reportId && (run.status === 'completed' || run.status === 'partial') ? (
        <Alert
          type={run.status === 'completed' ? 'success' : 'warning'}
          showIcon
          message={`研究报告 #${run.reportId} 已自动保存`}
          action={<Button size="small" href={`/research/reports?symbol=${encodeURIComponent(ticker)}`}>查看报告</Button>}
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
                    <Tag color={presentation.color} style={{ marginTop: 6 }}>{presentation.label}</Tag>
                  </div>
                </Space>
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary">工具 {agent.toolCalls} 次 · {agent.tokenCount} tokens</Text><br />
                  <Text type="secondary">
                    {agent.dependencies.length > 0 ? `依赖 ${agent.dependencies.length} 位前序专家` : '独立并行研究'}
                  </Text>
                  {agent.error ? <Paragraph type="danger" style={{ margin: '8px 0 0' }}>{agent.error}</Paragraph> : null}
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
        Agent 输出属于 MODEL_OUTPUT；请结合页面中的真实行情、来源与截止时间独立核验。
      </Text>
    </Card>
  );
}
