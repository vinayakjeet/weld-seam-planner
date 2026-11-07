import { defineConfig, devices } from '@playwright/test'

// The visual audit: every sample, both themes and three window sizes, photographed step by step. It is not part of CI
// (the e2e config only reads tests/e2e); run it with npm run audit:visual and read the pictures and checks.json files in
// test-results/visual-audit, or in AUDIT_OUT when set.
const PORT = 4174

export default defineConfig({
  testDir: '.',
  testMatch: /audit\.spec\.ts$/,
  outputDir: '../../test-results/visual-audit-runs',
  reporter: 'list',
  fullyParallel: true,
  workers: Number(process.env.AUDIT_WORKERS ?? 3),
  timeout: 600_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.AUDIT_URL ?? `http://localhost:${PORT}`,
    trace: 'off',
  },
  projects: [{ name: 'chromium' }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
