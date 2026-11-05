import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const VIEWPORT = { width: 1400, height: 900 }
// Chromium runs every spec. The other engines run the ones that load a part, pick, export and reach, which is where
// engines differ (WebGL, shared memory, workers, downloads); the rest check pixels and layout of one engine.
const CROSS_BROWSER = /(smoke|export|isolation|offline|reach|weld)\.spec\.ts$/

export default defineConfig({
  testDir: 'tests/e2e',
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    viewport: VIEWPORT,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: VIEWPORT } },
    { name: 'firefox', testMatch: CROSS_BROWSER, use: { ...devices['Desktop Firefox'], viewport: VIEWPORT } },
    { name: 'webkit', testMatch: CROSS_BROWSER, use: { ...devices['Desktop Safari'], viewport: VIEWPORT } },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
