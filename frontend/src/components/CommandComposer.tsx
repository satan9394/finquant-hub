import { useState } from 'react';
import { Button, Input } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useLanguage } from '../i18n/LanguageContext';

interface CommandComposerProps {
  onSubmit: (value: string) => void;
  /**
   * BACKLOG-032 Step B：语境化追问条只在研究语境且有当前对象时渲染。
   * contextLabel 用于呈现"当前对象"（如 贵州茅台 · 600519），提交携带
   * 原问题本身由 onSubmit(value) 透传，导航去向由调用方按对象拼装
   * /research/:symbol?prompt=…，问题不丢。
   */
  contextLabel?: string;
}

export default function CommandComposer({ onSubmit, contextLabel }: CommandComposerProps) {
  const { t } = useLanguage();
  const [value, setValue] = useState('');
  const submit = () => {
    const prompt = value.trim();
    if (!prompt) return;
    onSubmit(prompt);
    setValue('');
  };
  return (
    <div className="command-composer">
      <div className="command-composer__box">
        {contextLabel ? <span className="command-composer__context" aria-hidden="true">{contextLabel}</span> : null}
        <Input.TextArea
          value={value}
          autoSize={{ minRows: 1, maxRows: 4 }}
          aria-label={contextLabel ? t('composer.followupPlaceholder', { object: contextLabel }) : t('composer.placeholder')}
          placeholder={contextLabel ? t('composer.followupPlaceholder', { object: contextLabel }) : t('composer.placeholder')}
          onChange={(event) => setValue(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
      </div>
      <Button type="primary" icon={<SendOutlined />} aria-label={t('composer.submit')} onClick={submit} />
    </div>
  );
}
