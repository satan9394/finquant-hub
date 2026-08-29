import { useState } from 'react';
import { Button, Input } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useLanguage } from '../i18n/LanguageContext';

interface CommandComposerProps {
  onSubmit: (value: string) => void;
}

export default function CommandComposer({ onSubmit }: CommandComposerProps) {
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
      <Input.TextArea
        value={value}
        autoSize={{ minRows: 1, maxRows: 4 }}
        aria-label={t('composer.placeholder')}
        placeholder={t('composer.placeholder')}
        onChange={(event) => setValue(event.target.value)}
        onPressEnter={(event) => {
          if (!event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <Button type="primary" icon={<SendOutlined />} aria-label={t('composer.submit')} onClick={submit} />
    </div>
  );
}
