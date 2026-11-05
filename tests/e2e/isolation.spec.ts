import { expect, expectedSeams, loadSample, sampleById, seamRows, test } from './helpers'

const cell = sampleById('t-joint-merged')

test('the served app is cross-origin isolated, and a part still loads, detects and picks under it', async ({ page }) => {
  const response = await page.goto('/')
  const headers = response!.headers()
  expect(headers['cross-origin-opener-policy']).toBe('same-origin')
  expect(headers['cross-origin-embedder-policy']).toBe('require-corp')

  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true)
  expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe('function')

  await loadSample(page, cell)
  await expect(seamRows(page)).toHaveCount(expectedSeams(cell))

  // The viewport picks through the BVH the worker built over shared memory.
  const canvas = (await page.locator('canvas').boundingBox())!
  const selected = seamRows(page).and(page.locator('[aria-selected="true"]'))
  await expect(selected).toHaveCount(0)
  for (let y = 0.3; y < 0.9 && (await selected.count()) === 0; y += 0.005) {
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height * y)
  }
  await expect(selected).toHaveCount(1)
})
