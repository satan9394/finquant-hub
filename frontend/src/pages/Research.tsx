/* ============================================================
 * Research — 深度研究页（/research）
 * 功能：ticker 输入 + 4-agent 进度动画 + 富文本 Markdown 报告输出（SSE）
 * ============================================================ */
import { useState, useRef, useCallback } from 'react';
import {
  Card, Input, Button, Typography, Row, Col, Steps, Spin, Tag, message, Alert, Empty,
} from 'antd';
import {
  PlayCircleOutlined, ReloadOutlined, CheckCircleOutlined,
  LoadingOutlined, CloseCircleOutlined, RobotOutlined,
} from '@ant-design/icons';
import type { AgentStatus, ResearchAgent } from '../types';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ==================== Agent 定义 ====================
const AGENT_KEYS = ['business_analyst', 'financial_analyst', 'industry_researcher', 'risk_assessor'];

const AGENT_LABELS: Record<string, { name: string; role: string; icon: string }> = {
  business_analyst: { name: '商业模式', role: '业务、护城河与竞争力', icon: '🏢' },
  financial_analyst: { name: '财务分析', role: '估值与财务健康度', icon: '📊' },
  industry_researcher: { name: '行业研究', role: '产业链与行业周期', icon: '🔬' },
  risk_assessor: { name: '风险评估', role: '独立识别投资风险', icon: '🛡️' },
};

function reportToMarkdown(report: Record<string, unknown>): string {
  const sections: [string, string][] = [
    ['执行摘要', 'executive_summary'], ['商业模式', 'business_model_analysis'],
    ['财务分析', 'financial_analysis'], ['行业分析', 'industry_analysis'],
    ['风险提示', 'risk_analysis'], ['技术分析说明', 'technical_analysis'], ['综合结论', 'verdict'],
  ];
  return sections
    .map(([title, key]) => report[key] ? `## ${title}\n${String(report[key])}` : '')
    .filter(Boolean)
    .join('\n\n');
}

// ==================== 简单 Markdown 渲染 ====================
function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements = lines.map((line, i) => {
    // 标题
    if (line.startsWith('### ')) return <div key={i} style={{ fontSize: 15, fontWeight: 600, marginTop: 12, marginBottom: 6 }}>{line.slice(4)}</div>;
    if (line.startsWith('## ')) return <div key={i} style={{ fontSize: 17, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>{line.slice(3)}</div>;
    if (line.startsWith('# ')) return <div key={i} style={{ fontSize: 20, fontWeight: 700, marginTop: 20, marginBottom: 10 }}>{line.slice(2)}</div>;
    // 列表
    if (line.startsWith('- ')) return <div key={i} style={{ paddingLeft: 16, marginBottom: 2 }}>• {line.slice(2)}</div>;
    if (/^\d+\.\s/.test(line)) return <div key={i} style={{ paddingLeft: 16, marginBottom: 2 }}>{line}</div>;
    // 分隔线
    if (line.startsWith('---')) return <div key={i} style={{ borderTop: '1px solid #eee', margin: '12px 0' }} />;
    // 空行
    if (!line.trim()) return <div key={i} style={{ height: 8 }} />;
    // 加粗
    const rendered = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 普通段落
    return <Paragraph key={i} style={{ marginBottom: 4, whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: rendered }} />;
  });
  return <div>{elements}</div>;
}

// ==================== Agent 进度卡片 ====================
function AgentCard({ agent, status, progress }: { agent: string; status: AgentStatus; progress?: string }) {
  const info = AGENT_LABELS[agent] ?? { name: agent, role: '', icon: '🤖' };
  const statusIcon = status === 'completed' ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
    : status === 'running' ? <LoadingOutlined style={{ color: '#1890ff' }} />
    : status === 'failed' ? <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
    : <RobotOutlined style={{ color: '#d9d9d9' }} />;

  return (
    <Card size="small" style={{
      borderLeft: `3px solid ${
        status === 'completed' ? '#52c41a' : status === 'running' ? '#1890ff' : status === 'failed' ? '#ff4d4f' : '#d9d9d9'
      }`,
      opacity: status === 'pending' ? 0.5 : 1,
      transition: 'all 0.3s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 24 }}>{info.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{info.name}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{info.role}</div>
          {progress && <div style={{ fontSize: 11, color: '#1890ff', marginTop: 4 }}>{progress}</div>}
        </div>
        <div>{statusIcon}</div>
      </div>
    </Card>
  );
}

// ==================== 页面组件 ====================
export default function Research() {
  const [ticker, setTicker] = useState('');
  const [running, setRunning] = useState(false);
  const [agents, setAgents] = useState<ResearchAgent[]>([]);
  const [reportContent, setReportContent] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [done, setDone] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // 初始化 agent 状态
  const resetAgents = useCallback(() => {
    setAgents(AGENT_KEYS.map((key) => ({
      name: AGENT_LABELS[key]?.name ?? key,
      role: AGENT_LABELS[key]?.role ?? '',
      status: 'pending' as AgentStatus,
    })));
  }, []);

  // 开始研究
  const handleStart = useCallback(async () => {
    const code = ticker.trim();
    if (!code) { message.warning('请输入股票代码'); return; }

    setRunning(true);
    setDone(false);
    setReportContent('');
    setReportTitle('');
    resetAgents();

    abortRef.current = new AbortController();

    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: code }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: '请求失败' }));
        throw new Error(errData.detail || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无响应数据流');

      const decoder = new TextDecoder();
      let buffer = '';
      let accContent = '';

      const processSSEEvent = (event: string, payload: string) => {
        try {
          const data = JSON.parse(payload) as Record<string, any>;
          const agentKey = data.role_key as string | undefined;
          switch (event) {
            case 'agent_started': {
              const idx = AGENT_KEYS.indexOf(agentKey ?? '');
              if (idx >= 0) {
                setAgents((prev) => prev.map((a, i) =>
                  i === idx ? { ...a, status: 'running' as AgentStatus } : a
                ));
              }
              break;
            }
            case 'agent_completed': {
              const idx2 = AGENT_KEYS.indexOf(agentKey ?? '');
              if (idx2 >= 0) {
                setAgents((prev) => prev.map((a, i) =>
                  i === idx2 ? { ...a, status: 'completed' as AgentStatus } : a
                ));
              }
              break;
            }
            case 'report_progress': {
              setReportContent(`正在整合报告：${data.name ?? '处理中'}`);
              break;
            }
            case 'done': {
              const report = data.report ?? {};
              setReportTitle(`${report.company_name ?? code} 研究报告`);
              accContent = reportToMarkdown(report);
              setReportContent(accContent || '报告生成完成，但没有可展示的正文。');
              setDone(true);
              setRunning(false);
              break;
            }
            case 'error': {
              const idx = AGENT_KEYS.indexOf(agentKey ?? '');
              if (idx >= 0) setAgents((prev) => prev.map((agent, i) => i === idx ? { ...agent, status: 'failed' as AgentStatus, progress: data.message } : agent));
              else message.error(data.message || '研究请求失败');
              break;
            }
          }
        } catch { /* SSE 心跳或不完整分片不应中断研究 */ }
      };

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || '';
        for (const messageBlock of messages) {
          let event = 'message';
          const payload = messageBlock.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
          const eventLine = messageBlock.split('\n').find((line) => line.startsWith('event: '));
          if (eventLine) event = eventLine.slice(7).trim();
          if (payload) processSSEEvent(event, payload);
        }
      }
      if (buffer.trim()) {
        const payload = buffer.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
        const eventLine = buffer.split('\n').find((line) => line.startsWith('event: '));
        if (payload) processSSEEvent(eventLine?.slice(7).trim() ?? 'message', payload);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        message.error(err.message || '研究请求失败');
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [ticker, resetAgents]);

  // 停止
  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  // ==================== 渲染 ====================
  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <Title level={4} style={{ marginBottom: 4 }}>深度研究</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        输入股票代码，由多智能体协同完成基本面、技术面综合分析并生成报告
      </Text>

      {/* 输入区 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            placeholder="输入股票代码，如 600519"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            onPressEnter={!running ? handleStart : undefined}
            style={{ width: 240 }}
            disabled={running}
            allowClear
          />
          {running ? (
            <Button danger onClick={handleStop}>停止</Button>
          ) : (
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart} disabled={!ticker.trim()}>
              开始研究
            </Button>
          )}
        </div>
      </Card>

      {/* Agent 进度 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {AGENT_KEYS.map((key, i) => {
          const agent = agents[i];
          return (
            <Col xs={12} sm={6} key={key}>
              <AgentCard
                agent={key}
                status={agent?.status ?? 'pending'}
                progress={agent?.progress}
              />
            </Col>
          );
        })}
      </Row>

      {/* 报告输出 */}
      {(running || done || reportContent) ? (
        <Card
          size="small"
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RobotOutlined />
              <span>{reportTitle || '研究报告中...'}</span>
              {running && <Spin size="small" />}
            </div>
          }
          extra={done ? <Tag color="green">已完成</Tag> : running ? <Tag color="processing">生成中</Tag> : null}
          style={{
            minHeight: 300,
            borderTop: `3px solid ${done ? '#52c41a' : running ? '#1890ff' : '#d9d9d9'}`,
          }}
        >
          <div style={{ maxHeight: 600, overflow: 'auto', padding: '0 4px' }}>
            {reportContent ? (
              <MarkdownContent content={reportContent} />
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>
                <Spin />
                <div style={{ marginTop: 12 }}>等待智能体返回数据...</div>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card size="small" style={{ minHeight: 200 }}>
          <Empty description={'输入股票代码并点击「开始研究」以生成深度分析报告'} />
        </Card>
      )}

      {/* 免责声明 */}
      <div style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 24 }}>
        此内容由 AI 生成，不构成投资建议
      </div>
    </div>
  );
}
