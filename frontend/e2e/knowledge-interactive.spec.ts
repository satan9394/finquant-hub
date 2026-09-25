import { expect, test } from '@playwright/test';
import { mockApi } from './helpers';

const items = Array.from({ length: 90 }, (_, index) => {
  const close = 100 + Math.sin(index / 4) * 8 + index * 0.12;
  return {
    day: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000 + (index % 9) * 50,
  };
});

test('Knowledge plays a native strategy demo and carries its symbol and parameters into Strategy Lab', async ({ page }, testInfo) => {
  await mockApi(page, {
    'GET /api/instruments/600519/bars': {
      instrument: { symbol: '600519', name: '贵州茅台', market: 'CN', exchange: 'SSE', currency: 'CNY', asset_type: 'stock' },
      provider: 'e2e-fixture', as_of: '2025-03-31', timezone: 'Asia/Shanghai', currency: 'CNY',
      adjustment: 'qfq', frequency: '1d', quality_flags: [], items, indicators: {},
    },
  });

  await page.goto('/knowledge');
  await expect(page.getByTestId('strategy-interactive-demo')).toBeVisible();
  await expect(page.locator('.strategy-demo__chart canvas').first()).toBeVisible();
  await expect(page.getByText('e2e-fixture')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('knowledge-demo.png'), fullPage: true });

  await page.getByText('均值回归策略', { exact: true }).click();
  await expect(page.getByLabel('布林带标准差倍数')).toBeVisible();
  await expect(page.getByText('均值回归策略', { exact: true }).first()).toBeVisible();

  await page.getByText('双均线策略', { exact: true }).first().click();
  const shortWindow = page.getByRole('spinbutton', { name: '短均线周期' });
  await shortWindow.fill('10');
  await shortWindow.press('Enter');
  await expect(shortWindow).toHaveValue('10');
  await page.getByRole('button', { name: '带入策略实验室' }).click();
  await expect(page).toHaveURL(/\/strategy-lab\/ma-crossover\?[^#]*symbol=600519/);
  await expect(page).toHaveURL(/short_window=10/);
  await expect(page).toHaveURL(/long_window=24/);
  await expect(page.getByLabel('股票代码')).toHaveValue('600519');
  await page.getByText('高级：均线、费用与风控参数').click();
  await expect(page.getByLabel('短均线')).toHaveValue('10');
  await expect(page.getByLabel('长均线')).toHaveValue('24');
});
