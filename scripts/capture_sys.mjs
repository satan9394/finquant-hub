// Capture the 4 routes nginx-on-5173 mishandles on direct URL (/knowledge, /models,
// /mcp-market, /settings). These load SPA index via menu click only.
import { chromium } from '../frontend/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:5173';
const OUT = path.resolve('docs/ui-current');
mkdirSync(OUT, { recursive: true });

const ITEMS = [
  ['14-knowledge.png',  '知识库',     '知识',   '知识', 2500],
  ['15-models.png',     '模型管理',   '系统工具','模型', 2500],
  ['16-mcp-market.png', 'MCP 工具管理','系统工具','MCP', 2500],
  ['17-settings.png',   '系统设置',   '系统工具','设置', 2500],
];

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log(`  [pageerror] ${String(e.message).slice(0,120)}`));

for (const [file, label, group, waitText, sleep] of ITEMS) {
  try {
    // fresh shell load each time to avoid chrome-error poisoning
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    const grp = page.locator(`.ant-menu-submenu-title:has-text("${group}")`).first();
    try { await grp.click({ timeout: 2500 }); await page.waitForTimeout(600); } catch {}
    const item = page.locator(`.ant-menu-item:has-text("${label}")`).first();
    await item.click({ timeout: 6000 });
    await page.waitForTimeout(900);
    if (waitText) {
      try { await page.waitForSelector(`text=${waitText}`, { timeout: 12000 }); } catch {}
    }
    await page.waitForTimeout(sleep);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    const h = await page.evaluate(() => document.body.scrollHeight);
    console.log(`OK  ${file}  (url=${page.url()}, scrollH=${h}px)`);
  } catch (e) {
    console.log(`ERR ${file}: ${String(e.message).slice(0,150)}`);
  }
}

await browser.close();
console.log('DONE');
