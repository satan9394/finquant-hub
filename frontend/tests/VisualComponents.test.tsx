// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ChinaMap from '../src/components/ChinaMap';
import CountUp from '../src/components/CountUp';
import Marquee from '../src/components/Marquee';
import ScrollingTable from '../src/components/ScrollingTable';

const mocks = vi.hoisted(() => ({ registerMap: vi.fn(), renderChart: vi.fn() }));

vi.mock('echarts', () => ({ registerMap: mocks.registerMap }));
vi.mock('@datapool/china.geojson', () => ({ default: { type: 'FeatureCollection', features: [] } }));
vi.mock('echarts-for-react', () => ({
  default: (props: unknown) => {
    mocks.renderChart(props);
    return <div data-testid="echarts" />;
  },
}));

beforeEach(() => {
  mocks.renderChart.mockClear();
});

describe('dashboard visualization primitives', () => {
  test('renders accessible final values and real table rows', () => {
    render(
      <>
        <CountUp value={1234.5} decimals={1} prefix="¥" duration={0} />
        <ScrollingTable rows={[{ id: 'core', value: 8.2 }]} rowKey={(row) => row.id} columns={[
          { key: 'name', title: '组合', render: (row) => row.id },
          { key: 'return', title: '收益', render: (row) => `${row.value}%` },
        ]} />
        <Marquee items={['看多：盈利改善', '看空：估值偏高']} />
      </>,
    );

    expect(screen.getByLabelText('¥1,234.5')).toBeTruthy();
    expect(screen.getByText('core')).toBeTruthy();
    expect(screen.getByText('8.2%')).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('aria-label')).toContain('盈利改善');
  });

  test('registers local GeoJSON and passes province values to a map series', () => {
    render(<ChinaMap data={[{ name: '上海市', value: 3 }]} />);

    expect(mocks.registerMap).toHaveBeenCalledWith('finquant-china', expect.objectContaining({ type: 'FeatureCollection' }));
    const option = (mocks.renderChart.mock.calls[0][0] as { option: { series: { type: string; map: string; data: unknown[] }[] } }).option;
    expect(option.series[0]).toMatchObject({ type: 'map', map: 'finquant-china', data: [{ name: '上海市', value: 3 }] });
  });
});
