import { expect, test, type Page, type Route } from '@playwright/test';

import { fulfillSSE, mockApi, type MockValue } from './helpers';

const agents = [{
  id: 1,
  name: '价值投资官',
  role_key: 'value_investor',
  avatar: 'value',
  system_prompt: 'deterministic fixture',
  model_id: null,
  is_preset: 1,
  created_at: '2026-08-30T00:00:00Z',
}];

const session = {
  id: 7,
  title: '贵州茅台快速问答',
  mode: 'single',
  role_preset: 'value_investor',
  model_id: null,
  status: 'active',
  created_at: '2026-08-30T00:00:00Z',
  updated_at: '2026-08-30T00:00:00Z',
  message_count: 0,
};

const baseResponses: Record<string, MockValue> = {
  'GET /api/agents': { items: agents },
  'GET /api/chat/sessions': { items: [] },
};

async function openExistingChat(page: Page, responses: Record<string, MockValue> = {}) {
  await mockApi(page, {
    ...baseResponses,
    'GET /api/chat/sessions': { items: [session] },
    'GET /api/chat/sessions/7/messages': { items: [] },
    ...responses,
  });
  await page.goto('/research?mode=fast');
  await page.getByText(session.title).click();
  await expect(page.getByLabel('输入消息…（Shift+Enter 换行）')).toBeVisible();
}

test('chat shows a deterministic empty state when no sessions exist', async ({ page }) => {
  await mockApi(page, baseResponses);
  await page.goto('/research?mode=fast');

  await expect(page.getByTestId('research-mode-fast')).toBeVisible();
  await expect(page.getByText('请选择或创建一个会话')).toBeVisible();
  await expect(page.getByRole('button', { name: '新建会话' })).toBeVisible();
});

test('chat creates a session from the prefilled starter draft', async ({ page }) => {
  let createBody: Record<string, unknown> | undefined;
  await mockApi(page, {
    ...baseResponses,
    'POST /api/chat/sessions': async (route) => {
      createBody = route.request().postDataJSON() as Record<string, unknown>;
      return session;
    },
    'GET /api/chat/sessions/7/messages': { items: [] },
  });
  await page.goto('/chat?prompt=请分析贵州茅台');

  await page.getByRole('button', { name: '新建会话并继续' }).click();
  await expect(page.getByText(session.title)).toBeVisible();
  await expect(page.getByLabel('输入消息…（Shift+Enter 换行）')).toHaveValue('请分析贵州茅台');
  expect(createBody).toMatchObject({ role_preset: 'value_investor', model_id: null });
});

test('chat consumes token and done SSE frames and keeps the complete reply', async ({ page }) => {
  let messageBody: Record<string, unknown> | undefined;
  const stream = [
    'event: token\ndata: {"delta":"贵州茅台"}',
    'event: token\ndata: {"delta":"今日收涨"}',
    'event: done\ndata: {"message_id":11,"token_count":245}',
    '',
  ].join('\n\n');
  await openExistingChat(page, {
    'POST /api/chat/sessions/7/messages': async (route) => {
      messageBody = route.request().postDataJSON() as Record<string, unknown>;
      await fulfillSSE(route, stream);
    },
  });

  await page.getByLabel('输入消息…（Shift+Enter 换行）').fill('今天表现如何？');
  await page.getByRole('button').filter({ hasText: /^发送$/ }).click();

  await expect(page.getByText('贵州茅台今日收涨')).toBeVisible();
  await expect(page.getByText(/245 tokens/)).toBeVisible();
  await expect(page.getByRole('button').filter({ hasText: /^发送$/ })).toBeVisible();
  expect(messageBody).toEqual({ content: '今天表现如何？' });
});

test('chat surfaces an SSE error event and exits the streaming state', async ({ page }) => {
  await openExistingChat(page, {
    'POST /api/chat/sessions/7/messages': async (route) => {
      await fulfillSSE(route, 'event: error\ndata: {"error":"上游失败"}\n\n');
    },
  });

  await page.getByLabel('输入消息…（Shift+Enter 换行）').fill('触发错误');
  await page.getByRole('button').filter({ hasText: /^发送$/ }).click();

  await expect(page.getByText('上游失败')).toBeVisible();
  await expect(page.getByRole('button').filter({ hasText: /^发送$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
});

test('chat rejects an empty message without issuing the SSE request', async ({ page }) => {
  let requestCount = 0;
  await openExistingChat(page, {
    'POST /api/chat/sessions/7/messages': async (route: Route) => {
      requestCount += 1;
      await fulfillSSE(route, 'event: done\ndata: {"message_id":12,"token_count":0}\n\n');
    },
  });

  await page.getByRole('button').filter({ hasText: /^发送$/ }).click();

  expect(requestCount).toBe(0);
  await expect(page.getByLabel('输入消息…（Shift+Enter 换行）')).toHaveValue('');
});

test('legacy chat route redirects to Research fast mode and preserves the prompt', async ({ page }) => {
  await mockApi(page, baseResponses);
  await page.goto('/chat?prompt=估值复核');

  await expect(page).toHaveURL(/\/research\?(?=.*prompt=%E4%BC%B0%E5%80%BC%E5%A4%8D%E6%A0%B8)(?=.*mode=fast)/);
  await expect(page.getByTestId('research-mode-fast')).toBeVisible();
  await expect(page.getByLabel('快速问答内容')).toHaveValue('估值复核');
});
