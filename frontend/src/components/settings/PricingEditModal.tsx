import { Form, Input, InputNumber, Modal, Typography } from 'antd';
import { useEffect } from 'react';

import { useLanguage } from '../../i18n/LanguageContext';
import type { ModelPricingInput, ModelPricingItem } from '../../services/usageApi';

/** 单价输入精度：与 CC Switch PricingEditModal 的 step 0.0001 对齐。 */
export const PRICE_INPUT_STEP = 0.0001;

export interface PricingFormValues {
  model_name: string;
  input_per_1m: number;
  output_per_1m: number;
  currency: string;
}

/** 非负有限数值校验（前端即时反馈；后端仍独立校验，不依赖前端）。 */
export function isNonNegativeAmount(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
}

interface PricingEditModalProps {
  open: boolean;
  /** 编辑既有单价时传入；新增时为 null。 */
  item: ModelPricingItem | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: ModelPricingInput) => void;
}

export default function PricingEditModal({ open, item, saving, onCancel, onSubmit }: PricingEditModalProps) {
  const { t } = useLanguage();
  const [form] = Form.useForm<PricingFormValues>();
  const isNew = item === null;

  useEffect(() => {
    if (!open) return;
    if (item) {
      form.setFieldsValue({
        model_name: item.model_name,
        input_per_1m: item.input_per_1m,
        output_per_1m: item.output_per_1m,
        currency: item.currency,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ currency: 'CNY', input_per_1m: 0, output_per_1m: 0 });
    }
  }, [open, item, form]);

  const submit = async () => {
    let values: PricingFormValues;
    try {
      values = await form.validateFields();
    } catch {
      // 校验失败时 antd 已在表单内提示，不再向后端提交。
      return;
    }
    onSubmit({
      model_name: values.model_name.trim(),
      input_per_1m: Number(values.input_per_1m),
      output_per_1m: Number(values.output_per_1m),
      currency: values.currency.trim(),
    });
  };

  return (
    <Modal
      open={open}
      title={isNew ? t('settings.usage.pricing.addTitle') : t('settings.usage.pricing.editTitle', { model: item?.model_name ?? '' })}
      onCancel={onCancel}
      onOk={() => void submit()}
      okText={isNew ? t('settings.usage.pricing.add') : t('settings.usage.pricing.save')}
      confirmLoading={saving}
      destroyOnHidden
      data-testid="pricing-edit-modal"
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        {t('settings.usage.pricing.hint')}
      </Typography.Paragraph>
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="model_name"
          label={t('settings.usage.pricing.modelName')}
          rules={[
            {
              validator: (_rule, value: unknown) =>
                typeof value === 'string' && value.trim()
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('settings.usage.pricing.modelNameRequired'))),
            },
          ]}
        >
          <Input
            placeholder={t('settings.usage.pricing.modelNamePlaceholder')}
            maxLength={120}
            data-testid="pricing-model-name"
          />
        </Form.Item>
        <Form.Item
          name="input_per_1m"
          label={t('settings.usage.pricing.inputPrice')}
          rules={[{ validator: (_rule, value: unknown) => (isNonNegativeAmount(value) ? Promise.resolve() : Promise.reject(new Error(t('settings.usage.pricing.priceInvalid')))) }]}
        >
          <InputNumber step={PRICE_INPUT_STEP} min={0} style={{ width: '100%' }} data-testid="pricing-input-price" />
        </Form.Item>
        <Form.Item
          name="output_per_1m"
          label={t('settings.usage.pricing.outputPrice')}
          rules={[{ validator: (_rule, value: unknown) => (isNonNegativeAmount(value) ? Promise.resolve() : Promise.reject(new Error(t('settings.usage.pricing.priceInvalid')))) }]}
        >
          <InputNumber step={PRICE_INPUT_STEP} min={0} style={{ width: '100%' }} data-testid="pricing-output-price" />
        </Form.Item>
        <Form.Item
          name="currency"
          label={t('settings.usage.pricing.currency')}
          extra={t('settings.usage.pricing.currencyHint')}
          rules={[{ required: true, message: t('settings.usage.pricing.currencyRequired') }]}
        >
          <Input maxLength={8} placeholder="CNY" data-testid="pricing-currency" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
