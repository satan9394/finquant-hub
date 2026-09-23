import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-8000',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 1,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-8000',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun run build && cd ..\\backend && .venv\\Scripts\\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000',
    env: {
      SERVE_FRONTEND: '1',
      LOCAL_ONLY_MODE: '1',
    },
    url: 'http://127.0.0.1:8000/api/health',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
