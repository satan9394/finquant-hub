// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { reportToMarkdown, resolveReportQuality } from '../src/pages/Research';
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

describe('reportToMarkdown quality notice (G-03)', () => {
  const qualityPrefix = `**${zh['deep.report.qualityDegraded']}**\n\n---\n\n`;

  it('prefixes the general incomplete-report notice when quality is degraded (agent failure)', () => {
    const report = {
      quality: 'degraded',
      chapters: [{ order: 1, key: 'company_overview', title: '公司概况', content: '正文 A' }],
    };
    const md = reportToMarkdown(report, zhTranslate);
    expect(md.startsWith(qualityPrefix)).toBe(true);
    expect(md).toContain('本报告生成不完整');
    expect(md).toContain('## 公司概况\n正文 A');
    expect(md).not.toContain('主编审计未完成');
  });

  it('shows no notice when quality is audited or absent (zero regression)', () => {
    const audited = { quality: 'audited', executive_summary: '摘要正文' };
    const absent = { executive_summary: '摘要正文' };
    expect(reportToMarkdown(audited, zhTranslate)).not.toContain('⚠️');
    expect(reportToMarkdown(absent, zhTranslate)).not.toContain('⚠️');
  });

  it('prefers the lead-review notice when both lead and quality are degraded', () => {
    const report = { lead_review_status: 'degraded', quality: 'degraded', chapters: [] };
    const md = reportToMarkdown(report, zhTranslate);
    expect(md).toContain('主编审计未完成');
    expect(md).not.toContain('本报告生成不完整');
  });

  it('applies the quality notice to the legacy shape as well', () => {
    const report = { quality: 'degraded', executive_summary: '摘要正文' };
    const md = reportToMarkdown(report, zhTranslate);
    expect(md.startsWith(qualityPrefix)).toBe(true);
    expect(md).toContain('## 执行摘要\n摘要正文');
  });
});

describe('resolveReportQuality — done 事件质量映射 (G-03 回归防线)', () => {
  it('reads the top-level quality from the done payload (real-time path)', () => {
    // 后端 done_payload 形如 { report: {...}, quality: 'degraded' }
    expect(resolveReportQuality({ report: { company_name: 'X' }, quality: 'degraded' })).toBe('degraded');
    expect(resolveReportQuality({ report: { company_name: 'X' }, quality: 'audited' })).toBe('audited');
  });

  it('falls back to report.quality for historical/persisted shape', () => {
    expect(resolveReportQuality({ report: { quality: 'degraded' } })).toBe('degraded');
  });

  it('prefers the top-level quality when both exist', () => {
    expect(resolveReportQuality({ quality: 'degraded', report: { quality: 'audited' } })).toBe('degraded');
  });

  it('defaults to audited for missing/unknown values (no false alarm)', () => {
    expect(resolveReportQuality({})).toBe('audited');
    expect(resolveReportQuality({ report: null })).toBe('audited');
    expect(resolveReportQuality({ quality: undefined })).toBe('audited');
    expect(resolveReportQuality({ quality: 'something-else' })).toBe('audited');
  });
});
