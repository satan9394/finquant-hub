import { describe, expect, it } from 'vitest';

import config from '../vite.config';

describe('Vite API proxy', () => {
  it('preserves the browser host for same-origin CSRF validation', () => {
    const resolved = typeof config === 'function' ? config({ command: 'serve', mode: 'test' }) : config;
    const proxy = resolved.server?.proxy?.['/api'];

    expect(typeof proxy).toBe('object');
    expect(typeof proxy === 'object' && proxy.changeOrigin).toBe(false);
  });
});
