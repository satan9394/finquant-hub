import { useEffect, useRef, useState } from 'react';
import { Button, Empty, Input, List, Modal, Space, Tag, Typography, message } from 'antd';
import {
  BellOutlined, ExperimentOutlined, FileTextOutlined, FundOutlined, MessageOutlined,
  SearchOutlined, WalletOutlined,
} from '@ant-design/icons';

import { searchStocks } from '../services/stockApi';
import { listResearchWorkspaces } from '../services/researchApi';
import {
  globalTaskPath, isLikelyTicker, readRecentTargets, rememberRecentTarget,
  type GlobalTaskAction, type GlobalTaskTarget,
} from '../features/globalTaskEntry';

const { Text } = Typography;

interface GlobalTaskEntryProps {
  onNavigate: (path: string) => void;
}

const targetActions: Array<{ action: GlobalTaskAction; label: string; icon: React.ReactNode }> = [
  { action: 'analysis', label: '分析股票', icon: <FundOutlined /> },
  { action: 'research', label: '打开研究', icon: <SearchOutlined /> },
  { action: 'backtest', label: '验证策略', icon: <ExperimentOutlined /> },
  { action: 'portfolio', label: '加入组合', icon: <WalletOutlined /> },
  { action: 'thesis', label: '创建论文', icon: <FileTextOutlined /> },
  { action: 'alert', label: '设置预警', icon: <BellOutlined /> },
];

export default function GlobalTaskEntry({ onNavigate }: GlobalTaskEntryProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<GlobalTaskTarget[]>([]);
  const [selected, setSelected] = useState<GlobalTaskTarget | null>(null);
  const [recent, setRecent] = useState<GlobalTaskTarget[]>(readRecentTargets);
  const [saved, setSaved] = useState<GlobalTaskTarget[]>([]);

  const show = () => {
    setOpen(true);
    setRecent(readRecentTargets());
    void listResearchWorkspaces()
      .then((items) => setSaved(items.slice(0, 5).map((item) => ({ code: item.symbol, name: item.name ?? item.symbol }))))
      .catch(() => setSaved([]));
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        triggerRef.current?.click();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const runSearch = async () => {
    const value = query.trim();
    if (!value) return;
    setSearching(true);
    try {
      const items = await searchStocks(value);
      setResults(items.map((item) => ({ code: item.code, name: item.name, market: item.market })));
      if (items.length === 1) setSelected({ code: items[0].code, name: items[0].name, market: items[0].market });
      else if (!items.length && isLikelyTicker(value)) setSelected({ code: value.toUpperCase(), name: value.toUpperCase() });
    } catch {
      setResults([]);
      if (isLikelyTicker(value)) setSelected({ code: value.toUpperCase(), name: value.toUpperCase() });
      else message.warning('暂时无法搜索标的，可继续输入代码或使用快速问答');
    } finally {
      setSearching(false);
    }
  };

  const choose = (target: GlobalTaskTarget) => {
    setSelected(target);
    setQuery(`${target.name} ${target.code}`);
  };

  const go = (action: GlobalTaskAction) => {
    if (action === 'question') {
      if (!query.trim()) return;
      setOpen(false);
      onNavigate(globalTaskPath(action, null, query));
      return;
    }
    if (!selected) return;
    setRecent(rememberRecentTarget(selected));
    setOpen(false);
    onNavigate(globalTaskPath(action, selected));
  };

  const targetList = (title: string, items: GlobalTaskTarget[]) => items.length > 0 && (
    <div className="global-task-entry__history">
      <Text type="secondary">{title}</Text>
      <Space wrap>
        {items.map((item) => (
          <Button key={`${title}-${item.code}`} size="small" onClick={() => choose(item)}>
            {item.name} · {item.code}
          </Button>
        ))}
      </Space>
    </div>
  );

  return (
    <>
      <Button
        ref={triggerRef}
        className="global-task-entry-trigger"
        icon={<SearchOutlined />}
        aria-label="打开全局标的与任务入口"
        onClick={show}
      >
        <span className="global-task-entry-trigger__label">搜索标的、问题或任务</span>
        <span className="global-task-entry-trigger__shortcut" aria-hidden="true">⌘K</span>
      </Button>
      <Modal
        title="全局标的与任务入口"
        open={open}
        footer={null}
        width={680}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Input.Search
          size="large"
          value={query}
          aria-label="标的代码、公司名称或问题"
          placeholder="输入 600519、贵州茅台，或一个自然语言问题"
          enterButton="搜索标的"
          loading={searching}
          onChange={(event) => { setQuery(event.target.value); setSelected(null); }}
          onSearch={() => void runSearch()}
        />

        {results.length > 0 && (
          <List
            className="global-task-entry__results"
            size="small"
            dataSource={results}
            renderItem={(item) => (
              <List.Item>
                <Button type="text" block aria-label={`选择 ${item.name} ${item.code}`} onClick={() => choose(item)}>
                  <span>{item.name}</span><Tag>{item.code}</Tag><Text type="secondary">{item.market}</Text>
                </Button>
              </List.Item>
            )}
          />
        )}

        {selected ? (
          <div className="global-task-entry__tasks">
            <Text strong>已选择：{selected.name} · {selected.code}</Text>
            <div>
              {targetActions.map((item) => (
                <Button key={item.action} icon={item.icon} aria-label={item.label} onClick={() => go(item.action)}>{item.label}</Button>
              ))}
            </div>
          </div>
        ) : !results.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="先搜索并选择标的，或直接继续提问" />}

        <Button
          className="global-task-entry__question"
          icon={<MessageOutlined />}
          aria-label="将当前内容预填到快速问答"
          disabled={!query.trim()}
          onClick={() => go('question')}
          block
        >
          将当前内容预填到快速问答
        </Button>

        {targetList('最近标的', recent)}
        {targetList('已保存研究', saved)}
        <Text className="global-task-entry__note" type="secondary">这里只导航和预填；不会自动调用模型、运行回测或保存数据。模型、MCP 与凭据维护请从“系统工具”进入，它们不是普通研究任务的前置步骤。</Text>
      </Modal>
    </>
  );
}
