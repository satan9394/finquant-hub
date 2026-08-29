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

const { Text } = Typography;

interface GlobalTaskEntryProps {
  onNavigate: (path: string) => void;
}

const targetActions: Array<{ action: GlobalTaskAction; labelKey: string; icon: React.ReactNode }> = [
  { action: 'analysis', labelKey: 'command.analysis', icon: <FundOutlined /> },
  { action: 'research', labelKey: 'command.research', icon: <SearchOutlined /> },
  { action: 'backtest', labelKey: 'command.backtest', icon: <ExperimentOutlined /> },
  { action: 'portfolio', labelKey: 'command.portfolio', icon: <WalletOutlined /> },
  { action: 'thesis', labelKey: 'command.thesis', icon: <FileTextOutlined /> },
  { action: 'alert', labelKey: 'command.alert', icon: <BellOutlined /> },
];

export default function GlobalTaskEntry({ onNavigate }: GlobalTaskEntryProps) {
  const { t } = useLanguage();
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
      <Button
        ref={triggerRef}
        className="global-task-entry-trigger"
        icon={<SearchOutlined />}
        aria-label={t('command.open')}
        onClick={show}
      >
        <span className="global-task-entry-trigger__label">{t('command.placeholder')}</span>
        <span className="global-task-entry-trigger__shortcut" aria-hidden="true">⌘K</span>
      </Button>
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
