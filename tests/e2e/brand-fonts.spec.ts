import { expect, loadSample, sampleById, test } from './helpers'
import { STEPS } from '../../src/state/store'
import { STEP_PANEL_HEADING } from '../../src/ui/panels/panelHeadings'

const family = (locator: import('@playwright/test').Locator) => locator.evaluate((el) => getComputedStyle(el).fontFamily)

test('Redaction is only on the title, the empty-state headline and one left panel heading per step', async ({ page }) => {
  await page.goto('/')
  expect(await family(page.getByText('Weld Seam Planner', { exact: true }))).toMatch(/^Redaction/)
  expect(await family(page.getByRole('heading', { name: 'Drop an STL file or pick a sample' }))).toMatch(/^Redaction/)

  await loadSample(page, sampleById('t-joint-merged'))
  const panel = page.getByRole('complementary', { name: 'Seam list' })
  for (const step of STEPS) {
    const button = page.getByRole('navigation', { name: 'Workflow steps' }).getByRole('button', { name: step.label })
    await button.click()
    const headings = panel.getByRole('heading', { level: 2 })
    await expect(headings).toHaveCount(1)
    await expect(headings).toHaveText(STEP_PANEL_HEADING[step.id])
    expect(await family(headings)).toMatch(/^Redaction/)
    expect(await family(button)).toMatch(/^Onest/)
  }
})

test('with the font files blocked the app still lays out and falls back to a serif title', async ({ page, consoleErrors }) => {
  await page.route('**/*.woff2', (route) => route.abort())
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  const title = page.getByText('Weld Seam Planner', { exact: true })
  await expect(title).toBeVisible()
  expect(await page.evaluate(() => document.fonts.check('16px "Redaction"'))).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const header = await page.locator('header').boundingBox()
  const export_ = await page.getByRole('button', { name: 'Export', exact: true }).boundingBox()
  expect(export_!.x + export_!.width).toBeLessThanOrEqual(header!.x + header!.width)

  // Blocking the files is the point of this test, so the browser's resource failures are expected and nothing else is.
  expect(consoleErrors.every((message) => message.startsWith('Failed to load resource'))).toBe(true)
  consoleErrors.length = 0
})
