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
}, {
  id: 2,
  name: '技术分析师',
  role_key: 'technical_analyst',
  avatar: 'technical',
  system_prompt: 'deterministic technical fixture',
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

const secondSession = {
  ...session,
  id: 8,
  title: '宁德时代技术复盘',
  role_preset: 'technical_analyst',
};

function chatMessage(id: number, sessionId: number, role: 'user' | 'assistant', content: string) {
  return {
    id,
    conversation_id: sessionId,
    role,
    agent_name: null,
    content,
    round_number: 0,
    token_count: role === 'assistant' ? 20 : null,
    created_at: '2026-08-30T00:00:00Z',
  };
}

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

test('chat changes the active role through the session PUT contract', async ({ page }) => {
  let updateRequest: { method: string; path: string; body: unknown } | undefined;
  await openExistingChat(page, {
    'PUT /api/chat/sessions/7': async (route) => {
      const request = route.request();
      updateRequest = {
        method: request.method(),
        path: new URL(request.url()).pathname,
        body: request.postDataJSON(),
      };
      return { ...session, role_preset: 'technical_analyst' };
    },
  });

  await page.getByLabel('选择角色').first().click();
  await page.getByText('技术分析师', { exact: true }).click();

  await expect(page.getByText('角色已切换')).toBeVisible();
  expect(updateRequest).toEqual({
    method: 'PUT',
    path: '/api/chat/sessions/7',
    body: { role_preset: 'technical_analyst' },
  });
});

test('chat deletes the current session through DELETE and removes its list row', async ({ page }) => {
  let deleteRequest: { method: string; path: string } | undefined;
  await mockApi(page, {
    ...baseResponses,
    'GET /api/chat/sessions': { items: [session, secondSession] },
    'GET /api/chat/sessions/7/messages': { items: [] },
    'DELETE /api/chat/sessions/7': async (route) => {
      const request = route.request();
      deleteRequest = { method: request.method(), path: new URL(request.url()).pathname };
      return { ok: true };
    },
  });
  await page.goto('/research?mode=fast');
  await page.getByText(session.title, { exact: true }).click();

  const sessionRow = page.getByText(session.title, { exact: true }).locator('xpath=ancestor::li');
  await sessionRow.getByRole('img', { name: 'delete' }).click();
  await expect(page.getByText('确认删除？')).toBeVisible();
  await page.getByRole('button', { name: /^确\s*定$/ }).click();

  await expect(page.getByText(session.title, { exact: true })).toHaveCount(0);
  await expect(page.getByText(secondSession.title, { exact: true })).toBeVisible();
  await expect(page.getByText('请选择或创建一个会话')).toBeVisible();
  expect(deleteRequest).toEqual({ method: 'DELETE', path: '/api/chat/sessions/7' });
});

test('chat restores the selected historical session from its messages route', async ({ page }) => {
  const requestedMessagePaths: string[] = [];
  const history = [
    chatMessage(81, 8, 'user', '复盘宁德时代'),
    chatMessage(82, 8, 'assistant', '历史结论：趋势保持强势'),
  ];
  await mockApi(page, {
    ...baseResponses,
    'GET /api/chat/sessions': { items: [session, secondSession] },
    'GET /api/chat/sessions/8/messages': async (route) => {
      requestedMessagePaths.push(new URL(route.request().url()).pathname);
      return { items: history };
    },
  });
  await page.goto('/research?mode=fast');

  await page.getByText(secondSession.title, { exact: true }).click();

  await expect(page.getByText('复盘宁德时代', { exact: true })).toBeVisible();
  await expect(page.getByText('历史结论：趋势保持强势', { exact: true })).toBeVisible();
  expect(requestedMessagePaths).toEqual(['/api/chat/sessions/8/messages']);
});

test('chat uses the first agent role as the default for a new session', async ({ page }) => {
  let createRequest: { method: string; path: string; body: unknown } | undefined;
  let agentsRequested = false;
  await mockApi(page, {
    ...baseResponses,
    'GET /api/agents': async () => {
      agentsRequested = true;
      return { items: agents };
    },
    'POST /api/chat/sessions': async (route) => {
      const request = route.request();
      createRequest = {
        method: request.method(),
        path: new URL(request.url()).pathname,
        body: request.postDataJSON(),
      };
      return session;
    },
    'GET /api/chat/sessions/7/messages': { items: [] },
  });
  await page.goto('/research?mode=fast');
  await expect.poll(() => agentsRequested).toBe(true);

  await page.getByRole('button', { name: '新建会话' }).click();

  await expect(page.getByText(session.title, { exact: true })).toBeVisible();
  expect(createRequest).toEqual({
    method: 'POST',
    path: '/api/chat/sessions',
    body: { role_preset: 'value_investor', model_id: null },
  });
});

test('chat keeps streamed session A messages isolated while switching through session B', async ({ page }) => {
  const requestedMessagePaths: string[] = [];
  let persistedA = [] as ReturnType<typeof chatMessage>[];
  const sessionBHistory = [chatMessage(91, 8, 'assistant', 'B 会话独立历史')];
  await mockApi(page, {
    ...baseResponses,
    'GET /api/chat/sessions': { items: [session, secondSession] },
    'GET /api/chat/sessions/7/messages': async (route) => {
      requestedMessagePaths.push(new URL(route.request().url()).pathname);
      return { items: persistedA };
    },
    'GET /api/chat/sessions/8/messages': async (route) => {
      requestedMessagePaths.push(new URL(route.request().url()).pathname);
      return { items: sessionBHistory };
    },
    'POST /api/chat/sessions/7/messages': async (route) => {
      expect(new URL(route.request().url()).pathname).toBe('/api/chat/sessions/7/messages');
      expect(route.request().postDataJSON()).toEqual({ content: 'A 会话新问题' });
      persistedA = [
        chatMessage(71, 7, 'user', 'A 会话新问题'),
        chatMessage(72, 7, 'assistant', 'A 会话流式答案'),
      ];
      await fulfillSSE(route, [
        'event: token\ndata: {"delta":"A 会话流式答案"}',
        'event: done\ndata: {"message_id":72,"token_count":20}',
        '',
      ].join('\n\n'));
    },
  });
  await page.goto('/research?mode=fast');
  await page.getByText(session.title, { exact: true }).click();
  await page.getByLabel('输入消息…（Shift+Enter 换行）').fill('A 会话新问题');
  await page.getByRole('button').filter({ hasText: /^发送$/ }).click();
  await expect(page.getByText('A 会话流式答案', { exact: true })).toBeVisible();

  await page.getByText(secondSession.title, { exact: true }).click();
  await expect(page.getByText('B 会话独立历史', { exact: true })).toBeVisible();
  await expect(page.getByText('A 会话流式答案', { exact: true })).toHaveCount(0);

  await page.getByText(session.title, { exact: true }).click();
  await expect(page.getByText('A 会话流式答案', { exact: true })).toBeVisible();
  await expect(page.getByText('B 会话独立历史', { exact: true })).toHaveCount(0);
  expect(requestedMessagePaths).toEqual([
    '/api/chat/sessions/7/messages',
    '/api/chat/sessions/8/messages',
    '/api/chat/sessions/7/messages',
  ]);
});

test('legacy chat route redirects to Research fast mode and preserves the prompt', async ({ page }) => {
  await mockApi(page, baseResponses);
  await page.goto('/chat?prompt=估值复核');

  await expect(page).toHaveURL(/\/research\?(?=.*prompt=%E4%BC%B0%E5%80%BC%E5%A4%8D%E6%A0%B8)(?=.*mode=fast)/);
  await expect(page.getByTestId('research-mode-fast')).toBeVisible();
  await expect(page.getByLabel('快速问答内容')).toHaveValue('估值复核');
});
