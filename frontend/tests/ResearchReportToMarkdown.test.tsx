// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { reportToMarkdown } from '../src/pages/Research';
import zh from '../src/i18n/zh';

const zhTranslate = (key: string): string => zh[key] ?? key;
const degradedPrefix = `**${zh['deep.report.degradedNotice']}**\n\n---\n\n`;

describe('reportToMarkdown degraded notice (A6)', () => {
  it('prefixes the degraded notice at the top for the chapters shape when lead_review_status is degraded', () => {
    const report = {
      lead_review_status: 'degraded',
      chapters: [
        { order: 1, key: 'company_overview', title: '公司概况', content: '正文 A' },
        { order: 2, key: 'risk_analysis', title: '风险提示', content: '正文 B' },
      ],
    };
    const md = reportToMarkdown(report, zhTranslate);
    expect(md).toContain('⚠️ 主编审计未完成');
    expect(md).toContain('未经主编复核');
    expect(md.startsWith(degradedPrefix)).toBe(true);
    expect(md).toContain('## 公司概况\n正文 A');
    expect(md).toContain('## 风险提示\n正文 B');
  });

  it('prefixes the degraded notice for the legacy shape when lead_review_status is degraded', () => {
    const report = {
      lead_review_status: 'degraded',
      executive_summary: '摘要正文',
      verdict: '结论正文',
    };
    const md = reportToMarkdown(report, zhTranslate);
    expect(md.startsWith(degradedPrefix)).toBe(true);
    expect(md).toContain('## 执行摘要\n摘要正文');
    expect(md).toContain('## 综合结论\n结论正文');
  });

  it('shows no notice for audited or missing lead_review_status in both shapes', () => {
    const chaptersReport = {
      lead_review_status: 'audited',
      chapters: [{ order: 1, key: 'company_overview', title: '公司概况', content: '正文 A' }],
    };
    const legacyReport = { executive_summary: '摘要正文' };
    expect(reportToMarkdown(chaptersReport, zhTranslate)).not.toContain('⚠️');
    expect(reportToMarkdown(chaptersReport, zhTranslate)).toContain('## 公司概况\n正文 A');
    expect(reportToMarkdown(legacyReport, zhTranslate)).not.toContain('⚠️');
    expect(reportToMarkdown(legacyReport, zhTranslate)).toContain('## 执行摘要\n摘要正文');
  });

  it('keeps the notice even when the degraded report body is empty (no honest signal lost)', () => {
    const report = { lead_review_status: 'degraded', chapters: [] };
    const md = reportToMarkdown(report, zhTranslate);
    expect(md).toContain('⚠️ 主编审计未完成');
  });
});
