import { useEffect, useState } from 'react';
import { Button, Empty, Input, List, Modal, Space, Tag, Typography, message } from 'antd';
import {
  BellOutlined, ExperimentOutlined, FileTextOutlined, FundOutlined, MessageOutlined,
  SearchOutlined, WalletOutlined,
} from '@ant-design/icons';

import { searchStocks } from '../services/stockApi';
import { listResearchWorkspaces } from '../services/researchApi';
import {
  globalCommandIntent, globalTaskPath, isLikelyTicker, readRecentTargets, rememberRecentTarget,
  type GlobalTaskAction, type GlobalTaskTarget,
} from '../features/globalTaskEntry';
import { useLanguage } from '../i18n/LanguageContext';

const { Text } = Typography;

// BACKLOG-032 Step A：全局提问弹窗收敛为单实例（header 常驻的那一个）。
// 任何来源（⌘K 由 App 层注册、hero 触发按钮、其他入口）都 dispatch 本事件，
// 唯一监听者是 header 内嵌的这个 GlobalTaskEntry。组件自身不再注册 ⌘K，
// 避免"每实例一个 window keydown"在首页并存两份。
export const GLOBAL_TASK_OPEN_EVENT = 'finquant:open-global-entry';

interface GlobalTaskEntryProps {
  onNavigate: (path: string) => void;
  /**
   * BACKLOG-032 Step A：作为纯弹窗宿主时隐藏自带触发按钮（触发入口由
   * header/hero 的 CommandBar triggerOnly 按钮承担，全部 dispatch 全局事件，
   * 本宿主只响应打开）。false 时仍渲染自带 trigger（可独立使用）。
   */
  hideTrigger?: boolean;
}

const targetActions: Array<{ action: GlobalTaskAction; labelKey: string; icon: React.ReactNode }> = [
  { action: 'analysis', labelKey: 'command.analysis', icon: <FundOutlined /> },
  { action: 'research', labelKey: 'command.research', icon: <SearchOutlined /> },
  { action: 'backtest', labelKey: 'command.backtest', icon: <ExperimentOutlined /> },
  { action: 'portfolio', labelKey: 'command.portfolio', icon: <WalletOutlined /> },
  { action: 'thesis', labelKey: 'command.thesis', icon: <FileTextOutlined /> },
  { action: 'alert', labelKey: 'command.alert', icon: <BellOutlined /> },
];

export default function GlobalTaskEntry({ onNavigate, hideTrigger = false }: GlobalTaskEntryProps) {
  const { t } = useLanguage();
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
    // ⌘K 的注册已上收到 App 层（单实例）。这里只作为"唯一弹窗实例"响应
    // 全局打开事件：App 层 ⌘K 与 hero 触发按钮都 dispatch GLOBAL_TASK_OPEN_EVENT。
    const openFromGlobal = () => show();
    window.addEventListener(GLOBAL_TASK_OPEN_EVENT, openFromGlobal);
    return () => window.removeEventListener(GLOBAL_TASK_OPEN_EVENT, openFromGlobal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = async () => {
    const value = query.trim();
    if (!value) return;
    const command = globalCommandIntent(value);
    if (command) {
      setOpen(false);
      onNavigate(command.path);
      return;
    }
    setSearching(true);
    try {
      const items = await searchStocks(value);
      setResults(items.map((item) => ({ code: item.code, name: item.name, market: item.market })));
      if (items.length === 1) setSelected({ code: items[0].code, name: items[0].name, market: items[0].market });
      else if (!items.length && isLikelyTicker(value)) setSelected({ code: value.toUpperCase(), name: value.toUpperCase() });
    } catch {
      setResults([]);
      if (isLikelyTicker(value)) setSelected({ code: value.toUpperCase(), name: value.toUpperCase() });
      else message.warning(t('command.searchUnavailable'));
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
      {!hideTrigger ? (
        <Button
          className="global-task-entry-trigger"
          icon={<SearchOutlined />}
          aria-label={t('command.open')}
          onClick={show}
        >
          <span className="global-task-entry-trigger__label">{t('command.placeholder')}</span>
          <span className="global-task-entry-trigger__shortcut" aria-hidden="true">⌘K</span>
        </Button>
      ) : null}
      <Modal
        title={t('command.title')}
        open={open}
        footer={null}
        width={680}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Input.Search
          size="large"
          value={query}
          aria-label={t('command.inputLabel')}
          placeholder={t('command.inputPlaceholder')}
          enterButton={t('command.search')}
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
                <Button type="text" block aria-label={t('command.selectTarget', { name: item.name, code: item.code })} onClick={() => choose(item)}>
                  <span>{item.name}</span><Tag>{item.code}</Tag><Text type="secondary">{item.market}</Text>
                </Button>
              </List.Item>
            )}
          />
        )}

        {selected ? (
          <div className="global-task-entry__tasks">
            <Text strong>{t('command.selected', { name: selected.name, code: selected.code })}</Text>
            <div>
              {targetActions.map((item) => (
                <Button key={item.action} icon={item.icon} aria-label={t(item.labelKey)} onClick={() => go(item.action)}>{t(item.labelKey)}</Button>
              ))}
            </div>
          </div>
        ) : !results.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('command.empty')} />}

        <Button
          className="global-task-entry__question"
          icon={<MessageOutlined />}
          aria-label={t('command.question')}
          disabled={!query.trim()}
          onClick={() => go('question')}
          block
        >
          {t('command.question')}
        </Button>

        {targetList(t('command.recent'), recent)}
        {targetList(t('command.saved'), saved)}
        <Text className="global-task-entry__note" type="secondary">{t('command.note')}</Text>
      </Modal>
    </>
  );
}
