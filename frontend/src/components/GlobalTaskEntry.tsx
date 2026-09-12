import { useEffect, useRef, useState } from 'react';
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
// VS-38：失败态复用族内**唯一**三态实现（VS-29），这里不自己编排 loading/empty/error 的优先级。
import { LoadStateView, readStateOf } from './LoadFailureAlert';

const { Text } = Typography;

/**
 * VS-38：一次检索的**产出连同它属于哪个查询词**作为一个整体提交。
 * 此前 `results` 是裸挂在组件上的一个数组 ⇒ "输入框里已是新词 + 挂着的仍是上一词的候选"可以并存
 * （同族第 4 处：VS-32 `detailErrorId`、VS-36 `DiscoverOutcome`/`nameSearchFailure`）。
 */
interface TaskSearchOutcome {
  query: string;
  results: GlobalTaskTarget[];
}

/**
 * VS-38：失败态**自带归属**（哪个查询词 + 出错原文）。
 * 不用"发起新请求时清一下"掩盖 —— 那样会丢掉"这条失败是谁的"，切回旧词就再也看不到它。
 */
interface TaskSearchFailure {
  query: string;
  error: string;
}

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
  // VS-38：候选结果不再裸挂 —— 一份产出 = 一个值 + 它属于哪个查询词（`query` 字段）。
  const [outcome, setOutcome] = useState<TaskSearchOutcome | null>(null);
  // VS-38：失败态自带归属（哪个词 + 原文），不再靠"发起新请求时清空 results"掩盖。
  const [searchFailure, setSearchFailure] = useState<TaskSearchFailure | null>(null);
  // VS-38：**在途也带归属**——"正在为哪个词请求"。没有它，在途只能靠"空态"或什么都不渲染来表达，
  // 而这两种都会让"新词正在查"看起来像"新词什么也没有"（VS-29 要消灭的正是这种假象）。
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [selected, setSelected] = useState<GlobalTaskTarget | null>(null);
  const [recent, setRecent] = useState<GlobalTaskTarget[]>(readRecentTargets);
  const [saved, setSaved] = useState<GlobalTaskTarget[]>([]);
  // VS-38：迟到的响应不得改写"当前查询词"的产出/失败（同族：VS-36 在 Discover/AlphaPanel 的 requestId 守卫）。
  const requestId = useRef(0);

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

  const runSearch = async (rawQuery = query) => {
    const value = rawQuery.trim();
    if (!value) return;
    const command = globalCommandIntent(value);
    if (command) {
      setOpen(false);
      onNavigate(command.path);
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    setPendingQuery(value);
    try {
      const items = await searchStocks(value);
      // 迟到的响应（中途换词/重试）不写归属：它属于的那个词已经不是输入框里的词了。
      if (id !== requestId.current) return;
      setOutcome({ query: value, results: items.map((item) => ({ code: item.code, name: item.name, market: item.market })) });
      // "成功才清"（VS-32 口径）：同一个词的失败在重试期间保持显示，成功之后才消失。
      setSearchFailure((current) => (current && current.query === value ? null : current));
      if (items.length === 1) setSelected({ code: items[0].code, name: items[0].name, market: items[0].market });
      else if (!items.length && isLikelyTicker(value)) setSelected({ code: value.toUpperCase(), name: value.toUpperCase() });
    } catch (error) {
      if (id !== requestId.current) return;
      // VS-38：失败**不再**被渲染成"没有结果" —— 带出归属与底层原文，交给族内唯一错误态实现。
      setSearchFailure({ query: value, error: error instanceof Error ? error.message : String(error) });
      if (isLikelyTicker(value)) setSelected({ code: value.toUpperCase(), name: value.toUpperCase() });
      else message.warning(t('command.searchUnavailable'));
    } finally {
      if (id === requestId.current) {
        setSearching(false);
        setPendingQuery(null);
      }
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

  // VS-38：渲染处只认"属于**输入框里当前那个词**"的那一份产出/失败/在途。候选列表就在输入框正下方，
  // 词一变（哪怕还没提交）旧候选就必须让位；词改回来时它又回来 —— 归属保留，而不是被清掉。
  const scopedOutcome = outcome && outcome.query === query.trim() ? outcome : null;
  const scopedFailure = searchFailure && searchFailure.query === query.trim() ? searchFailure : null;
  const scopedPending = pendingQuery !== null && pendingQuery === query.trim();
  const results = scopedOutcome?.results ?? [];
  const emptyHint = <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('command.empty')} />;
  // 三态优先级**不在这里编排**（VS-29：全产品唯一的判据是 `readStateOf`）——这里只交事实：
  // 当前词失败了吗、成功读到过吗、手上几条、原文是什么。剩下那种"还没有结论"由它判成 loading，
  // 而不是像修前那样退回"没有结果"的空态。
  const searchState = readStateOf({
    failed: Boolean(scopedFailure),
    resolved: Boolean(scopedOutcome),
    count: results.length,
    error: scopedFailure?.error,
  });
  // 只区分"当前词有没有活动"：有结论（成功/失败）或在途 ⇒ 三态视图；否则是"还没查过这个词"，
  // 既不摆空态也不摆转圈（修前输入框空着就显示空态，那才是"把没查过说成没有结果"）。
  const searchStarted = Boolean(scopedOutcome || scopedFailure || scopedPending);

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

        {/* VS-38：候选 / 空态 / 失败三态由族内唯一实现渲染（`LoadStateView` 的错误分支内部转调
            `LoadFailureAlert`），重试**真的重发同一个查询词**；失败时绝不摆"没有结果"的观感。 */}
        {searchStarted ? (
          <LoadStateView
            state={searchState}
            failureMessage={t('command.searchFailed')}
            onRetry={() => void runSearch(scopedFailure?.query)}
            emptyContent={emptyHint}
          >
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
          </LoadStateView>
        ) : (selected ? null : emptyHint)}

        {selected ? (
          <div className="global-task-entry__tasks">
            <Text strong>{t('command.selected', { name: selected.name, code: selected.code })}</Text>
            <div>
              {targetActions.map((item) => (
                <Button key={item.action} icon={item.icon} aria-label={t(item.labelKey)} onClick={() => go(item.action)}>{t(item.labelKey)}</Button>
              ))}
            </div>
          </div>
        ) : null}

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
