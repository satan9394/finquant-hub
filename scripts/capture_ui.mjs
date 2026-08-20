// Capture full-page screenshots of all FinQuant Hub pages on http://127.0.0.1:5173 (per user).
// Strategy: direct page.goto() for every route (SPA renders client-side). For any route
// that lands on a chrome-error page (nginx 301 mishap on this port), fall back to SPA
// navigation by clicking the exact menu anchor a[href=...].
import { chromium } from '../frontend/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:5173';
const OUT = path.resolve('docs/ui-current');
mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['01-dashboard.png',          '/',                          '大屏概览', 2500],
  ['02-research-workspace.png', '/research',                  '研究工作区', 2500],
  ['03-deep-research.png',      '/research/reports',          '深度研究', 2500],
  ['04-chat.png',               '/chat',                      '会话', 2200],
  ['05-discussion.png',         '/discussion',                '讨论', 2200],
  ['06-thesis.png',             '/thesis',                    '论文', 2200],
  ['07-stock-analysis.png',     '/analysis/600519',           '贵州茅台', 3500],
  ['08-compare.png',            '/compare',                   '比较', 2200],
  ['09-screening.png',          '/screening',                 '选股', 2200],
  ['10-strategy-lab.png',       '/strategy-lab/ma-crossover', '回测', 3000],
  ['11-alpha.png',              '/alpha',                     'Alpha', 2500],
  ['12-portfolio.png',          '/portfolio',                 '组合', 2500],
  ['13-alerts.png',             '/alerts',                    '预警', 2200],
  ['14-knowledge.png',          '/knowledge',                 '知识', 2200],
  ['15-models.png',             '/models',                    '模型', 2200],
  ['16-mcp-market.png',         '/mcp-market',                'MCP', 2200],
  ['17-settings.png',           '/settings',                  '设置', 2200],
];

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log(`  [pageerror] ${String(e.message).slice(0,120)}`));

// Preload app shell for SPA fallback
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2500);

const spaGoto = async (route) => {
  const href = `a[href="${route}"]`;
  const link = page.locator(href).first();
  const parentLabels = { '/research/reports':'研究','/research':'研究','/compare':'研究','/chat':'研究','/discussion':'研究','/thesis':'研究','/strategy-lab/ma-crossover':'策略','/screening':'策略','/alpha':'策略','/portfolio':'组合','/alerts':'组合','/knowledge':'知识','/models':'系统工具','/mcp-market':'系统工具','/settings':'系统工具' };
  const parent = parentLabels[route];
  if (parent) {
    const grp = page.locator(`.ant-menu-submenu-title:has-text("${parent}")`).first();
    try { await grp.click({ timeout: 2500 }); await page.waitForTimeout(500); } catch {}
  }
  try {
    await link.click({ timeout: 5000 });
    await page.waitForTimeout(900);
    return true;
  } catch { return false; }
};

for (const [file, route, waitText, sleep] of PAGES) {
  try {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    // If we hit a chrome-error page, use SPA fallback
    if (page.url().includes('chrome-error') || page.url().includes('127.0.0.1/knowledge/')) {
      console.log(`  [spa-fallback needed for ${route}]`);
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1800);
      await spaGoto(route);
    }
    if (waitText) {
      try { await page.waitForSelector(`text=${waitText}`, { timeout: 12000 }); } catch {}
    }
    await page.waitForTimeout(sleep);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    const h = await page.evaluate(() => document.body.scrollHeight);
    const err = page.url().includes('chrome-error') ? ' [CHROME-ERROR]' : '';
    console.log(`OK  ${file}  (url=${page.url()}${err}, scrollH=${h}px)`);
  } catch (e) {
    console.log(`ERR ${file}  (route=${route}): ${String(e.message).slice(0,150)}`);
  }
}

await browser.close();
console.log('DONE');
