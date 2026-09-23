import { Button, Card, Input, Space, Tag, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import StatusChip from './StatusChip';
import { useLanguage } from '../i18n/LanguageContext';

const requestedFilters = ['aShare', 'roe', 'fcf', 'pe'] as const;

export default function DiscoverSearch({ value, loading, onChange, onSubmit, onApplyFilter }: {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onApplyFilter?: (filter: string, checked: boolean) => void;
}) {
  const { t } = useLanguage();
  return (
    <Card className="surface-card discover-search">
      <Typography.Title level={3}>{t('discover.searchTitle')}</Typography.Title>
      <Typography.Paragraph type="secondary">{t('discover.searchHelp')}</Typography.Paragraph>
      <Input.TextArea
        aria-label={t('discover.queryAria')}
        autoSize={{ minRows: 3, maxRows: 6 }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onPressEnter={(event) => {
          if (!event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder={t('discover.placeholder')}
      />
      <div className="discover-search__footer">
        <Space wrap>
          {requestedFilters.map((filter) => (
            <Tag.CheckableTag
              key={filter}
              checked={value.includes(t(`discover.filter.${filter}`))}
              onChange={(checked) => onApplyFilter?.(t(`discover.filter.${filter}`), checked)}
            >
              {t(`discover.filter.${filter}`)}
            </Tag.CheckableTag>
          ))}
          <StatusChip tone="warning" label={t('discover.unsupported')} />
        </Space>
        <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={onSubmit}>{t('discover.submit')}</Button>
      </div>
    </Card>
  );
}
