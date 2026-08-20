import { describe, expect, it } from 'vitest';

import { getMenuKey, isSystemToolPath, navigationGroups } from '../src/App';

const originalMenuPaths = [
  '/',
  '/chat',
  '/discussion',
  '/research',
  '/strategy-lab/ma-crossover',
  '/portfolio',
  '/screening',
  '/alpha',
  '/knowledge',
  '/models',
  '/mcp-market',
  '/alerts',
  '/thesis',
  '/settings',
];

describe('product navigation', () => {
  it('separates ordinary product routes from system maintenance routes', () => {
    expect(navigationGroups.map((group) => group.name)).toEqual([
      '今日',
      '研究',
      '策略',
      '组合',
      '知识',
      '系统工具',
    ]);

    const paths = navigationGroups.flatMap((group) => group.children.map((item) => item.path));

    expect(paths).toEqual(expect.arrayContaining(originalMenuPaths));
    expect(paths).toContain('/research/reports');
    expect(paths).toContain('/compare');
    expect(new Set(paths).size).toBe(paths.length);
    expect(navigationGroups.find((group) => group.key === 'knowledge')?.children.map((item) => item.path)).toEqual(['/knowledge']);
    expect(navigationGroups.find((group) => group.key === 'system-tools')?.children.map((item) => item.path)).toEqual(['/models', '/mcp-market', '/settings']);
    expect(navigationGroups.find((group) => group.key === 'system-tools')?.children.map((item) => item.name)).toEqual(['模型管理', 'MCP 工具管理', '系统设置']);
    expect(isSystemToolPath('/models')).toBe(true);
    expect(isSystemToolPath('/settings/security')).toBe(true);
    expect(isSystemToolPath('/research')).toBe(false);
  });

  it('selects the owning navigation entry for dynamic routes', () => {
    expect(getMenuKey('/analysis/600519')).toBe('/research');
    expect(getMenuKey('/research/600519')).toBe('/research');
    expect(getMenuKey('/research/reports')).toBe('/research/reports');
    expect(getMenuKey('/compare')).toBe('/compare');
    expect(getMenuKey('/strategy-lab/ma-crossover')).toBe('/strategy-lab/ma-crossover');
  });
});
