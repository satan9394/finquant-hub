import { expect, test } from '@playwright/test';

import { mockApi } from './helpers';

test('limit-pool renders direct Eastmoney rows and amount formatting', async ({ page }) => {
  await mockApi(page, {
    'GET /api/market/limit-pool': {
      date: '20260831',
      pool: 'limit_up',
      source: 'eastmoney.push2ex',
      quality: 'DIRECT',
      items: [{
        code: '600519', name: '贵州茅台', limit_up_count: 2, seal_amount: 12_345_678,
        break_times: 1, industry: '白酒', limit_stat: '3天2板',
      }],
    },
  });

  await page.goto('/discover/limit-pool');

  await expect(page.getByRole('heading', { name: '涨跌停池' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '600519' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '贵州茅台' })).toBeVisible();
  await expect(page.getByText('1,234.57 万元')).toBeVisible();
  await expect(page.getByText(/eastmoney\.push2ex.*DIRECT/)).toBeVisible();
});

test('limit-pool presents UNKNOWN non-trading-day evidence without crashing', async ({ page }) => {
  await mockApi(page, {
    'GET /api/market/limit-pool': {
      date: '20260830',
      pool: 'limit_up',
      source: 'eastmoney.push2ex',
      quality: 'UNKNOWN',
      error: '东财未返回池数据（可能为非交易日或盘后尚未更新）',
      items: [],
    },
  });

  await page.goto('/discover/limit-pool');

  await expect(page.getByText('东财未返回池数据（可能为非交易日或盘后尚未更新）')).toBeVisible();
  await expect(page.getByText('当前池暂无可用记录')).toBeVisible();
});
