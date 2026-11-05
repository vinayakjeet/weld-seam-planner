import { counts, expect, expectedSeams, loadSample, sampleById, seamRows, statusBar, test } from './helpers'

const tank = sampleById('tank-with-manhole')
const DEMO_URL = '/?sample=tank-with-manhole&demo=1'

test.setTimeout(300_000)

test('the demo link accepts the tank, places a port, measures reach and lands on the snake arm, with a saved plan left alone', async ({ page }) => {
  // A first visit saves a plan for the tank with only some seams accepted.
  await page.goto('/')
  await loadSample(page, tank)
  await page.getByRole('slider', { name: 'Confidence threshold' }).fill('0.95')
  await page.getByRole('button', { name: 'Accept all above 0.95' }).click()
  const savedCount = Number(/Seams accepted \/ candidate\s*(\d+)/.exec((await statusBar(page).textContent()) ?? '')?.[1])
  expect(savedCount, 'the first visit should accept some seams but not all').toBeGreaterThan(0)
  expect(savedCount).toBeLessThan(expectedSeams(tank))
  await page.waitForTimeout(2000)

  await page.goto(DEMO_URL)
  await expect(page.getByRole('progressbar', { name: 'Reach progress' })).toBeVisible({ timeout: 120_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(/Reach measured for 20 seams/)).toBeVisible({ timeout: 120_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await expect(statusBar(page)).toContainText(counts(expectedSeams(tank), 0))
  await expect(page.getByRole('listitem', { name: 'Port P1' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Workflow steps' }).getByRole('button', { name: /Access/ })).toHaveAttribute('aria-current', 'step')
  await expect(seamRows(page).filter({ has: page.getByRole('cell', { name: 'S16', exact: true }) })).toHaveAttribute('aria-selected', 'true')
  const main = page.getByRole('main', { name: '3D viewport' })
  await expect.poll(async () => Number(await main.getAttribute('data-arm-links'))).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'X-ray' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Autosave is paused for this demo.')).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/deeplink-demo.png' })

  // Long enough for an autosave to have run if it were on; the saved plan must still be the first visit's.
  await page.waitForTimeout(2500)
  await page.goto('/')
  await loadSample(page, tank)
  const restore = page.getByRole('dialog', { name: 'Restore your saved plan?' })
  await expect(restore).toBeVisible()
  await expect(restore).toContainText(`${savedCount} accepted seam`)
})

test('an unknown sample shows what happened and fetches nothing outside the samples folder', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (request) => requested.push(new URL(request.url()).pathname))
  await page.goto('/?sample=..%2F..%2Fx')
  await expect(page.getByRole('alert')).toContainText('was not found')
  await expect(page.getByRole('heading', { name: 'Drop an STL file or pick a sample' })).toBeVisible()
  expect(requested.filter((path) => path.includes('..') || path.endsWith('/x'))).toEqual([])
  expect(requested.filter((path) => path.includes('/samples/') && !path.endsWith('manifest.json'))).toEqual([])
})

test('a plain sample link loads that sample without the demo', async ({ page }) => {
  const tjoint = sampleById('t-joint-merged')
  await page.goto('/?sample=t-joint-merged')
  await expect(seamRows(page)).toHaveCount(expectedSeams(tjoint), { timeout: 30_000 })
  await expect(page.getByRole('listitem', { name: 'Port P1' })).toHaveCount(0)
  await expect(statusBar(page)).toContainText(counts(0, expectedSeams(tjoint)))
})

test('demo on a sample other than the tank loads it and says the demo is only for the tank', async ({ page }) => {
  await page.goto('/?sample=t-joint-merged&demo=1')
  await expect(seamRows(page)).toHaveCount(expectedSeams(sampleById('t-joint-merged')), { timeout: 30_000 })
  await expect(page.getByText('The demo was not started.')).toBeVisible()
})
