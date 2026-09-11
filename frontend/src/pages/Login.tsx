import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Space, Spin, Typography } from 'antd';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { requestLoginCode } from '../services/authApi';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../i18n/LanguageContext';

interface LoginLocationState {
  from?: string;
}

export default function Login() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const status = useAuthStore((state) => state.status);
  const initialize = useAuthStore((state) => state.initialize);
  const retry = useAuthStore((state) => state.retry);
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'idle') void initialize();
  }, [initialize, status]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  if (status === 'idle' || status === 'loading') {
    return <div className="auth-loading"><Spin size="large" /></div>;
  }

  const sendCode = async () => {
    setSubmitting(true);
    setError('');
    try {
      const result = await requestLoginCode(email.trim());
      setEmail(email.trim());
      setStep('code');
      setCooldown(result.cooldown_seconds);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : t('auth.error.sendCode'));
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async () => {
    setSubmitting(true);
    setError('');
    try {
      await login(email, code);
      const target = (location.state as LoginLocationState | null)?.from || '/';
      navigate(target, { replace: true });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : t('auth.error.verifyCode'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-shell">
      <Card className="login-card" variant="outlined">
        <div className="login-brand" aria-hidden="true">FQ</div>
        <Typography.Title level={2}>{t('auth.title')}</Typography.Title>
        <Typography.Paragraph type="secondary">
          {t('auth.subtitle')}
        </Typography.Paragraph>
        {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 18 }} /> : null}

        {/* VS11 防御性兜底：本地模式不提供邮箱登录（request-code 直接 404），
            这里给出说明与重试入口，避免用户困在无法完成的登录页。 */}
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 18 }}
          message={t('auth.localFallback.title')}
          description={t('auth.localFallback.body')}
          action={(
            <Button size="small" onClick={() => { void retry(); }} data-testid="login-retry-connection">
              {t('auth.localFallback.retry')}
            </Button>
          )}
        />

        {step === 'email' ? (
          <Form layout="vertical" onFinish={sendCode} requiredMark={false}>
            <Form.Item label={t('auth.email')} htmlFor="login-email" required>
              <Input
                id="login-email"
                size="large"
                prefix={<MailOutlined />}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </Form.Item>
            <Button block size="large" type="primary" htmlType="submit" loading={submitting}>
              {t('auth.sendCode')}
            </Button>
          </Form>
        ) : (
          <Form layout="vertical" onFinish={verifyCode} requiredMark={false}>
            <Alert
              type="info"
              showIcon
              message={t('auth.codeSent', { email })}
              style={{ marginBottom: 18 }}
            />
            <Form.Item label={t('auth.code')} htmlFor="login-code" required>
              <Input
                id="login-code"
                size="large"
                prefix={<LockOutlined />}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                required
                autoFocus
              />
            </Form.Item>
            <Button
              block
              size="large"
              type="primary"
              htmlType="submit"
              loading={submitting}
              disabled={code.length !== 6}
            >
              {t('auth.signIn')}
            </Button>
            <Space className="login-secondary-actions">
              <Button type="link" onClick={() => { setStep('email'); setCode(''); setError(''); }}>
                {t('auth.changeEmail')}
              </Button>
              <Button type="link" onClick={sendCode} disabled={cooldown > 0 || submitting}>
                {cooldown > 0 ? t('auth.resendCountdown', { seconds: cooldown }) : t('auth.resend')}
              </Button>
            </Space>
          </Form>
        )}
      </Card>
    </main>
  );
}
