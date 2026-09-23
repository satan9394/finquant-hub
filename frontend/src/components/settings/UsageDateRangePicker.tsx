import { Alert, Button, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';

import { useLanguage } from '../../i18n/LanguageContext';
import { RANGE_PRESETS, usageRangeError, usageRangeLabel, type UsageRange } from '../../utils/usageRange';

interface UsageDateRangePickerProps {
  value: UsageRange;
  onChange: (range: UsageRange) => void;
  /** Window actually queried, echoed by the backend (honest, not client-guessed). */
  windowStart?: string;
  windowEnd?: string;
  disabled?: boolean;
}

/**
 * Preset / custom window picker for the usage detail module (BACKLOG-045).
 *
 * Presets keep the legacy `days` semantics; the custom form uses native date
 * inputs and only emits once both dates are valid and ordered — an invalid range
 * is reported, never silently corrected.
 */
export default function UsageDateRangePicker({
  value,
  onChange,
  windowStart,
  windowEnd,
  disabled = false,
}: UsageDateRangePickerProps) {
  const { t } = useLanguage();
  const [draftStart, setDraftStart] = useState(value.start ?? '');
  const [draftEnd, setDraftEnd] = useState(value.end ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    setDraftStart(value.start ?? '');
    setDraftEnd(value.end ?? '');
    setError('');
  }, [value]);

  const openCustom = () => {
    setDraftStart(value.start ?? windowStart ?? '');
    setDraftEnd(value.end ?? windowEnd ?? '');
    setError('');
  };

  const applyCustom = () => {
    const candidate: UsageRange = { kind: 'custom', start: draftStart, end: draftEnd };
    const reason = usageRangeError(candidate);
    if (reason) {
      setError(t(reason));
      return;
    }
    setError('');
    onChange(candidate);
  };

  const isCustom = value.kind === 'custom';

  return (
    <Space direction="vertical" size={4} style={{ width: '100%' }} data-testid="usage-range-picker">
      <Space wrap size={8}>
        {RANGE_PRESETS.map((days) => (
          <Button
            key={days}
            size="small"
            disabled={disabled}
            type={!isCustom && value.days === days ? 'primary' : 'default'}
            data-testid={`usage-range-preset-${days}`}
            onClick={() => {
              setError('');
              onChange({ kind: 'preset', days });
            }}
          >
            {t('settings.usage.range.presetLabel', { days })}
          </Button>
        ))}
        <Button
          size="small"
          disabled={disabled}
          type={isCustom ? 'primary' : 'default'}
          data-testid="usage-range-custom-toggle"
          onClick={openCustom}
        >
          {t('settings.usage.range.custom')}
        </Button>
        <Typography.Text type="secondary" data-testid="usage-range-label">
          {usageRangeLabel(value, t)}
        </Typography.Text>
      </Space>

      {isCustom ? (
        <Space wrap size={8} align="center">
          <label>
            <Typography.Text type="secondary" style={{ marginRight: 4 }}>
              {t('settings.usage.range.start')}
            </Typography.Text>
            <input
              type="date"
              aria-label={t('settings.usage.range.start')}
              data-testid="usage-range-start"
              value={draftStart}
              disabled={disabled}
              onChange={(event) => setDraftStart(event.target.value)}
            />
          </label>
          <label>
            <Typography.Text type="secondary" style={{ marginRight: 4 }}>
              {t('settings.usage.range.end')}
            </Typography.Text>
            <input
              type="date"
              aria-label={t('settings.usage.range.end')}
              data-testid="usage-range-end"
              value={draftEnd}
              disabled={disabled}
              onChange={(event) => setDraftEnd(event.target.value)}
            />
          </label>
          <Button
            size="small"
            type="primary"
            disabled={disabled}
            data-testid="usage-range-apply"
            onClick={applyCustom}
          >
            {t('settings.usage.range.apply')}
          </Button>
          <Typography.Text type="secondary">{t('settings.usage.range.hint')}</Typography.Text>
        </Space>
      ) : null}

      {error ? (
        <Alert type="warning" showIcon message={error} data-testid="usage-range-error" />
      ) : null}

      {windowStart && windowEnd ? (
        <Typography.Text type="secondary" data-testid="usage-range-window">
          {t('settings.usage.range.current', { start: windowStart, end: windowEnd })}
        </Typography.Text>
      ) : null}
    </Space>
  );
}
