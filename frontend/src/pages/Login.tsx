import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { requestLoginCode } from '../services/authApi';
import { useAuthStore } from '../store/authStore';

interface LoginLocationState {
  from?: string;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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

  const sendCode = async () => {
    setSubmitting(true);
    setError('');
    try {
      const result = await requestLoginCode(email.trim());
      setEmail(email.trim());
      setStep('code');
      setCooldown(result.cooldown_seconds);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '验证码发送失败');
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
      setError(reason instanceof Error ? reason.message : '验证码校验失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-shell">
      <Card className="login-card" variant="outlined">
        <div className="login-brand" aria-hidden="true">FQ</div>
        <Typography.Title level={2}>登录 FinQuant Hub</Typography.Title>
        <Typography.Paragraph type="secondary">
          使用邮箱验证码登录，无需设置或保存密码。
        </Typography.Paragraph>
        {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 18 }} /> : null}

        {step === 'email' ? (
          <Form layout="vertical" onFinish={sendCode} requiredMark={false}>
            <Form.Item label="邮箱" htmlFor="login-email" required>
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
              获取验证码
            </Button>
          </Form>
        ) : (
          <Form layout="vertical" onFinish={verifyCode} requiredMark={false}>
            <Alert
              type="info"
              showIcon
              message={`验证码已发送至 ${email}`}
              style={{ marginBottom: 18 }}
            />
            <Form.Item label="6 位验证码" htmlFor="login-code" required>
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
              登录
            </Button>
            <Space className="login-secondary-actions">
              <Button type="link" onClick={() => { setStep('email'); setCode(''); setError(''); }}>
                更换邮箱
              </Button>
              <Button type="link" onClick={sendCode} disabled={cooldown > 0 || submitting}>
                {cooldown > 0 ? `${cooldown}s 后重发` : '重新发送'}
              </Button>
            </Space>
          </Form>
        )}
      </Card>
    </main>
  );
}
