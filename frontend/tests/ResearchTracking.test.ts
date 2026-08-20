import { describe, expect, it } from 'vitest';

import { reportThesisPath, thesisAlertPath } from '../src/features/researchTracking';

describe('research tracking routes', () => {
  it('opens the exact saved report before any thesis write', () => {
    expect(reportThesisPath('600519', 6)).toBe('/research/reports?symbol=600519&report=6');
  });

  it('prefills an alert with thesis context without saving it', () => {
    const path = thesisAlertPath({ id: 12, ticker: '00700.HK', title: '腾讯现金流论文' });
    const params = new URLSearchParams(path.split('?')[1]);

    expect(path.startsWith('/alerts?')).toBe(true);
    expect(params.get('new')).toBe('1');
    expect(params.get('ticker')).toBe('00700.HK');
    expect(params.get('thesis')).toBe('12');
    expect(params.get('name')).toBe('腾讯现金流论文 · 技术信号核验');
  });
});
