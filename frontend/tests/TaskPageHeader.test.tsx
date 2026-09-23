// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { Button } from 'antd';
import { describe, expect, test } from 'vitest';
import TaskPageHeader from '../src/components/TaskPageHeader';

describe('TaskPageHeader', () => {
  test('presents task, object, data status, and primary action in one landmark', () => {
    render(
      <TaskPageHeader
        eyebrow="研究"
        title="个股分析"
        goal="判断当前状态并决定下一步"
        object="贵州茅台 · 600519"
        status="行情与指标已更新"
        statusTone="success"
        actions={<Button type="primary">刷新分析</Button>}
      />,
    );

    expect(screen.getByRole('region', { name: '个股分析' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '个股分析', level: 2 })).toBeTruthy();
    expect(screen.getByText('当前对象：贵州茅台 · 600519')).toBeTruthy();
    expect(screen.getByText('数据状态：行情与指标已更新')).toBeTruthy();
    expect(screen.getByRole('button', { name: '刷新分析' })).toBeTruthy();
  });
});
