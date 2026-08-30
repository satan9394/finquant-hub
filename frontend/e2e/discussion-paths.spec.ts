import { expect, test, type Page } from '@playwright/test';

import { fulfillSSE, mockApi, type MockValue } from './helpers';

const agents = [
  ['价值投资官', 'value_investor'],
  ['技术分析师', 'technical_analyst'],
  ['量化研究员', 'quant_researcher'],
  ['风控委员', 'risk_manager'],
].map(([name, roleKey], index) => ({
  id: index + 1,
  name,
  role_key: roleKey,
  avatar: roleKey,
  system_prompt: 'deterministic fixture',
  model_id: null,
  is_preset: 1,
  created_at: '2026-08-30T00:00:00Z',
}));

const room = {
  id: 9,
  conversation_id: 19,
  topic: '贵州茅台是否值得长期持有',
  participants: agents.map((agent) => ({ role_key: agent.role_key, name: agent.name, avatar: agent.avatar })),
  total_rounds: 1,
  current_phase: 'active',
  summary: null,
  created_at: '2026-08-30T00:00:00Z',
};

const baseResponses: Record<string, MockValue> = {
  'GET /api/agents': { items: agents },
  'GET /api/discussion/rooms': { items: [] },
};

async function openExistingDiscussion(page: Page, responses: Record<string, MockValue> = {}) {
  await mockApi(page, {
    ...baseResponses,
    'GET /api/discussion/rooms': { items: [room] },
    'GET /api/discussion/rooms/9': { room, messages: [] },
    ...responses,
  });
  await page.goto('/research?mode=review');
  await page.getByText(room.topic).first().click();
  await expect(page.getByRole('button', { name: '开始讨论' })).toBeVisible();
}

test('discussion shows a deterministic empty state when no rooms exist', async ({ page }) => {
  await mockApi(page, baseResponses);
  await page.goto('/research?mode=review');

  await expect(page.getByTestId('research-mode-review')).toBeVisible();
  await expect(page.getByText('暂无讨论')).toBeVisible();
  await expect(page.getByText('请选择或创建一个讨论房间')).toBeVisible();
});

test('discussion creates a room from the legacy route topic draft', async ({ page }) => {
  let createBody: Record<string, unknown> | undefined;
  await mockApi(page, {
    ...baseResponses,
    'POST /api/discussion/rooms': async (route) => {
      createBody = route.request().postDataJSON() as Record<string, unknown>;
      return room;
    },
    'GET /api/discussion/rooms/9': { room, messages: [] },
  });
  await page.goto('/discussion?topic=长期持有复核');

  await page.getByRole('button', { name: /^创\s*建$/ }).click();
  await expect(page.getByText('讨论房间已创建')).toBeVisible();
  await expect(page.getByRole('heading', { name: room.topic })).toBeVisible();
  expect(createBody).toMatchObject({
    topic: '长期持有复核',
    role_keys: agents.map((agent) => agent.role_key),
    total_rounds: 3,
  });
});

test('discussion consumes agent lifecycle SSE frames and reaches done cleanly', async ({ page }) => {
  let startCount = 0;
  const stream = [
    'event: agent_start\ndata: {"agent":"value_investor","name":"价值投资官","round":1}',
    'event: token\ndata: {"delta":"我认为..."}',
    'event: agent_end\ndata: {"agent":"value_investor","message_id":31,"token_count":320}',
    'event: done\ndata: {"room_id":9}',
    '',
  ].join('\n\n');
  await openExistingDiscussion(page, {
    'POST /api/discussion/rooms/9/start': async (route) => {
      startCount += 1;
      await fulfillSSE(route, stream);
    },
  });

  await page.getByRole('button', { name: '开始讨论' }).click();

  await expect(page.getByText('已完成').last()).toBeVisible();
  await expect(page.getByRole('button', { name: '停止讨论' })).toHaveCount(0);
  await expect(page.getByText('价值投资官').first()).toBeVisible();
  expect(startCount).toBe(1);
});

test('discussion surfaces an SSE error and exits the streaming state', async ({ page }) => {
  await openExistingDiscussion(page, {
    'POST /api/discussion/rooms/9/start': async (route) => {
      await fulfillSSE(route, 'event: error\ndata: {"error":"讨论上游失败"}\n\n');
    },
  });

  await page.getByRole('button', { name: '开始讨论' }).click();

  await expect(page.getByText('讨论上游失败')).toBeVisible();
  await expect(page.getByRole('button', { name: '开始讨论' })).toBeVisible();
  await expect(page.getByRole('button', { name: '停止讨论' })).toHaveCount(0);
});

test('legacy discussion route redirects to Research review mode and preserves the topic', async ({ page }) => {
  await mockApi(page, baseResponses);
  await page.goto('/discussion?topic=多空分歧');

  await expect(page).toHaveURL(/\/research\?(?=.*topic=%E5%A4%9A%E7%A9%BA%E5%88%86%E6%AD%A7)(?=.*mode=review)/);
  await expect(page.getByTestId('research-mode-review')).toBeVisible();
  await expect(page.getByRole('dialog', { name: '创建讨论房间' })).toBeVisible();
  await expect(page.getByLabel('讨论主题')).toHaveValue('多空分歧');
});
