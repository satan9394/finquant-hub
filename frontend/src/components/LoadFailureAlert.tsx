import { Alert, Button } from 'antd';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * VS22：读取失败的**唯一**呈现形态 —— 失败文案 + 具体错误 + 可点的重试。
 *
 * 原则（VS19 在首页"最近记录"卡片上建立，VS22 推广到左栏列表与"研究运行"区块）：
 * **空态只能代表"确实没有数据"；请求失败必须显式说出来。**
 * 只要还有一处把"读取失败"渲染成"暂无…"，用户就会以为自己从没保存过数据、或误删了数据。
 *
 * 之所以抽成组件而不是各写一遍：同一页面上"同一个失败"出现两种待遇（一处 Alert、一处空态）
 * 正是本类缺陷的复发形态。共用同一实现后，新接入的位置不可能再写出第二种口径。
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
