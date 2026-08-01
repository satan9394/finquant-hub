export default function Marquee({ items, emptyText = '暂无市场信号' }: { items: string[]; emptyText?: string }) {
  if (items.length === 0) return <div className="data-marquee data-marquee--empty">{emptyText}</div>;
  const content = items.join('　·　');
  return (
    <div className="data-marquee" role="status" aria-label={content}>
      <div className="data-marquee__track" aria-hidden="true"><span>{content}</span><span>{content}</span></div>
    </div>
  );
}
