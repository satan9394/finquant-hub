import type { ReactNode } from 'react';
import { Alert, Button, Empty, Spin, Typography } from 'antd';
import { useLanguage } from '../i18n/LanguageContext';

const { Text } = Typography;

/**
 * VS29：读取的**三态契约**（loading / empty / error）在这里定义，别处不得再自行编排优先级。
 *
 * 背景：VS22 建立的 `LoadFailureAlert` 只有 `error` / `onRetry` 两个维度，于是每个使用点都要
 * 自己拼 `loading` / `empty` 判断 —— "加载中仍渲染空态文案"因此反复出现（VS22 只分开了
 * "失败 vs 空"，"加载中 vs 空"没分）。本文件把它补成一个**判别联合**（discriminated union）：
 * 三态是**一个值**，不是三个可以被同时置真的布尔量。
 *
 * 分工：
 *   `ReadState` / `readStateOf`  → **唯一**决定优先级的地方；
 *   `LoadStateView`              → **唯一**渲染三态的地方（一个 switch，分支互斥）；
 *   `LoadFailureAlert`           → 收窄为"只负责错误态"的呈现（错误分支内部固定转调它）。
 */

/** 读取的三态（外加"有内容"的 ready）。四者互斥。 */
export type ReadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; error: string }
  | { status: 'ready' };

export interface ReadFacts {
  /** 最近一次读取是否失败。**不要**用"错误文案非空"当判据：底层错误可能没有 message。 */
  failed?: boolean;
  /** 是否已经成功读取过一次（哪怕读回来是空的）。只有它为真，"确实没有数据"才成立。 */
  resolved?: boolean;
  /** 当前可展示的内容条数（应用已知存在的记录也算）。 */
  count?: number;
  /** 底层错误原文，失败时原样带出（不吞掉）。 */
  error?: string | null;
}

/**
 * 三态判据（**全产品唯一**的优先级）：
 *
 *   1. `failed`            → error   —— 失败优先于一切；失败时绝不冒称"没有数据"。
 *   2. `count > 0`         → ready   —— 手上有内容就先给内容（刷新在途不清空已读到的）。
 *   3. `resolved`          → empty   —— 成功读过且确实为空，"暂无…"只在这里成立。
 *   4. 其余                → loading —— **兜底**：还没有任何结论时宁可说"加载中"，
 *                                      也不许退化成"暂无…"（本卡要消灭的正是这种假象）。
 *
 * 注意第 4 条的含义：`loading` = "还没有结论"，不等于"请求此刻在途"。已经成功读到内容的
 * 刷新期间仍是 ready（内容不清空），失败过的重试期间仍是 error（失败态不清，见 §口径）。
 */
export function readStateOf({ failed, resolved, count, error }: ReadFacts = {}): ReadState {
  if (failed) return { status: 'error', error: error ?? '' };
  if ((count ?? 0) > 0) return { status: 'ready' };
  if (resolved) return { status: 'empty' };
  return { status: 'loading' };
}

/**
 * VS22：读取失败的**唯一**呈现形态 —— 失败文案 + 具体错误 + 可点的重试。
 *
 * 原则（VS19 在首页"最近记录"卡片上建立，VS22 推广到左栏列表与"研究运行"区块）：
 * **空态只能代表"确实没有数据"；请求失败必须显式说出来。**
 * 只要还有一处把"读取失败"渲染成"暂无…"，用户就会以为自己从没保存过数据、或误删了数据。
 *
 * VS29 收窄契约：**本组件只负责错误态**。加载态与空态一律走 `LoadStateView`
 * （它的错误分支内部转调本组件），不要再用条件渲染自己拼 `loading`/`empty`。
 */
export default function LoadFailureAlert({
  message,
  error,
  onRetry,
}: {
  /** 失败文案：说清"什么东西读不出来"，例如"会话列表读取失败"。 */
  message: string;
  /** 具体错误：把底层原因原样带出，不吞掉。 */
  error?: string;
  /** 重试：必须真的重新发起该读取请求。 */
  onRetry: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Alert
      type="error"
      showIcon
      message={message}
      description={error}
      action={<Button onClick={onRetry}>{t('common.retry')}</Button>}
    />
  );
}

/**
 * VS29：三态的**唯一渲染出口**。
 *
 * 一个 `switch` ⇒ 四个分支互斥 ⇒ "加载中"与"暂无…"在结构上不可能同时出现在屏幕上。
 * 调用方只负责给出**事实**（`readStateOf` 的入参），不负责决定谁优先。
 */
export function LoadStateView({
  state,
  failureMessage,
  onRetry,
  loadingText,
  emptyContent,
  retainedCount,
  showContentOnError,
  announceLoading,
  children,
}: {
  /** 由 `readStateOf()` 产出的三态。 */
  state: ReadState;
  /** 错误态文案：说清"什么东西读不出来"。 */
  failureMessage: string;
  /** 错误态的重试：必须真的重新发起该读取请求。 */
  onRetry: () => void;
  /** 加载态文案（可选）。 */
  loadingText?: string;
  /**
   * 空态内容（"暂无…"的**唯一出口**）。
   * 缺省时刻意**不写任何"暂无…"文案**（只有图标）：宁可少说一句，也不替调用方冒称"没有数据"。
   */
  emptyContent?: ReactNode;
  /**
   * 错误态下仍可展示的内容条数（应用已知真实存在、或上一次成功读到的记录）。
   * 与 `showContentOnError` 同时为真时才继续渲染 `children`：失败不得顺手藏掉真实存在的记录。
   */
  retainedCount?: number;
  /** 默认 false：失败即不渲染内容（避免失败态与内容"串台"）。 */
  showContentOnError?: boolean;
  /**
   * 加载态是否作为 live region（`role="status"`）向读屏播报。**默认关闭**：
   * 一屏之内可能同时有多个读取在途（侧栏列表 + 主内容区详情），多个 live region 会互相打断；
   * 只有主内容区的加载态开启（Discussion 详情）。既有断言 `Discussion.test.tsx:55` 用
   * `getByRole('status')` 唯一命中主内容区，也依赖这个默认值。
   */
  announceLoading?: boolean;
  children?: ReactNode;
}) {
  switch (state.status) {
    case 'loading':
      return (
        <div
          className="fq-load-state fq-load-state--loading"
          style={{ padding: 16, textAlign: 'center' }}
          {...(announceLoading ? { role: 'status', 'aria-live': 'polite' as const } : {})}
        >
          <Spin size="small" />
          {loadingText ? (
            <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>{loadingText}</Text>
          ) : null}
        </div>
      );
    case 'empty':
      return (
        <div className="fq-load-state fq-load-state--empty">
          {emptyContent ?? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={null} />}
        </div>
      );
    case 'error':
      return (
        <div className="fq-load-state fq-load-state--error">
          <LoadFailureAlert message={failureMessage} error={state.error} onRetry={onRetry} />
          {showContentOnError && (retainedCount ?? 0) > 0 ? children : null}
        </div>
      );
    default:
      return <>{children}</>;
  }
}
