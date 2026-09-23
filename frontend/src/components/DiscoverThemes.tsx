import { useRef, useState } from 'react';
import { Alert, Button, Card, Input, List, Segmented, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { fetchMarketThemes } from '../services/marketDiscoveryApi';
import type { MarketThemesResponse } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import LoadFailureAlert from './LoadFailureAlert';

/**
 * VS39：一次板块检索的产出**连同它属于哪个查询词**作为一个整体提交（同 Discover.tsx 的
 * `DiscoverOutcome`、VS-36 的 `itemsKeyword`/`errorKeyword`，以及更早 VS-32 的 `detailErrorId`）。
 *
 * 修前：`payload` 与 `error` 是两个各自赋值的 state，且都在**发起时**被清
 * （`setPayload(null)` / `setError(false)`）——既回看不了上一词的结果，也没有"这条失败是谁的"
 * 这一信息（`error` 是个无归属的布尔量），失败更**没有任何重试入口**。
 * 现在：结果与失败各自带 `keyword` 归属，失败态留在原地（成功才清），并复用族内唯一错误态实现
 * `LoadFailureAlert` 给出**真的重发同一查询词**的重试。
 */
type ThemesOutcome = { keyword: string; payload: MarketThemesResponse };

export default function DiscoverThemes() {
  const { t } = useLanguage();
  // 输入框里的词就是本组件的"当前实体"（同 AlphaResearchPanel 的 `query`/`currentKeyword`）。
  const [keyword, setKeyword] = useState('');
  const [kind, setKind] = useState('all');
  // 结果自带归属：换词在途时不可能再看到上一词的产出。
  const [outcome, setOutcome] = useState<ThemesOutcome | null>(null);
  // 失败态同样自带归属（哪个查询词 + 出错原文）：切到新词时旧失败因归属不匹配而自动退出视野，
  // 而"这条失败是谁的"这一信息被保住（切回去仍然显示它）。
  const [failure, setFailure] = useState<{ keyword: string; error: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const run = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const id = ++requestId.current;
    // 这里**只是把"当前实体"切到新词上**：上一词的产出/失败因归属不匹配而不再渲染，
    // 不需要（也不应该）顺手把它们清掉 —— 信息保留在原位，切回去还在。
    setKeyword(value);
    setLoading(true);
    try {
      const result = await fetchMarketThemes(trimmed);
      // 迟到的成功不得覆盖新词的检索。
      if (id !== requestId.current) return;
      setOutcome({ keyword: trimmed, payload: result });
      // "成功才清失败态"（VS-32 口径）：重试期间失败态保持显示，成功后才消失。
      setFailure((current) => (current && current.keyword === trimmed ? null : current));
    } catch (error) {
      // 迟到的失败不得挂到新词上：它属于发起它的那个查询词。
      if (id !== requestId.current) return;
      setFailure({ keyword: trimmed, error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };
  // 渲染处只认"属于输入框当前词"的那一份 —— 上一词的结果与失败原文都不会挂在新词上。
  const currentKeyword = keyword.trim();
  const scopedOutcome = outcome && outcome.keyword === currentKeyword ? outcome : null;
  const scopedFailure = failure && failure.keyword === currentKeyword ? failure : null;
  const payload = scopedOutcome?.payload ?? null;
  return <Card className="surface-card" title={t('discover.themes.title')}>
    <Typography.Paragraph type="secondary">{t('discover.themes.help')}</Typography.Paragraph>
    <Input.Search aria-label={t('discover.themes.title')} maxLength={30} value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={(value) => void run(value)} loading={loading} enterButton={t('discover.themes.search')} />
    <Space wrap style={{ marginTop: 12 }}>{['半导体', '新能源', '人工智能'].map((value) => <Button key={value} onClick={() => void run(value)}>{value}</Button>)}</Space>
    <Segmented style={{ marginTop: 12, display: 'block' }} value={kind} onChange={setKind} options={['all', 'industry', 'concept'].map((value) => ({ value, label: t(`discover.themes.${value}`) }))} />
    {/* VS39：失败 ⇒ 失败态（可归因 + 可重试），且与下面的内容**互斥**：
        修前那句 `{error && <Alert …/>}` 既没有重试入口，也不知道这条失败属于哪个词。 */}
    {scopedFailure
      ? <LoadFailureAlert message={t('discover.themes.failed')} error={scopedFailure.error} onRetry={() => void run(scopedFailure.keyword)} />
      : payload && <>
        <Typography.Paragraph type="secondary">{payload.source.join(' / ')} · {payload.as_of} · {t(`discover.themes.status.${payload.status}`)}</Typography.Paragraph>
        {payload.status === 'partial' && <Alert type="warning" showIcon message={t('discover.themes.partial')} />}
        <List dataSource={payload.themes.filter((theme) => kind === 'all' || theme.kind === kind)} locale={{ emptyText: t('discover.themes.empty') }} renderItem={(theme) => <List.Item>
          <Space direction="vertical">
            <span><Tag>{t(`discover.themes.${theme.kind}`)}</Tag>{theme.name}</span>
            <Space wrap>{theme.stocks.map((stock) => <Link key={stock.code} to={`/research/${encodeURIComponent(stock.code)}`}>{stock.name} · {stock.code}</Link>)}</Space>
          </Space>
        </List.Item>} />
      </>}
  </Card>;
}
