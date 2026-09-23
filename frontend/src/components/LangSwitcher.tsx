import { Button } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useLanguage } from '../i18n/LanguageContext';

export default function LangSwitcher() {
  const { lang, setLang, t } = useLanguage();
  const next = lang === 'zh' ? 'en' : 'zh';
  return (
    <Button
      type="text"
      icon={<GlobalOutlined />}
      aria-label={t(lang === 'zh' ? 'lang.switchToEnglish' : 'lang.switchToChinese')}
      onClick={() => setLang(next)}
    >
      {t(lang === 'zh' ? 'lang.englishShort' : 'lang.chineseShort')}
    </Button>
  );
}
