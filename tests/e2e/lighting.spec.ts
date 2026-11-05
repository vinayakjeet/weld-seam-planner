import { expect, loadSample, sampleById, test } from './helpers'
import { meanBrightness } from './pixels'

test.setTimeout(120_000)

// Where the top, the front and the right face of the tank show in the default view of a 1400 x 900 window, as fractions of
// the canvas, away from every seam and from the manhole.
const FACES = { top: [0.561, 0.401], front: [0.357, 0.582], right: [0.781, 0.594] } as const
const PATCH = 9

test('the three visible faces of a box differ in brightness by about 1.0, 0.75 and 0.55', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto('/')
  await loadSample(page, sampleById('tank-with-manhole'))
  await page.getByRole('navigation', { name: 'Workflow steps' }).getByRole('button', { name: 'Seams' }).click()
  await page.waitForTimeout(800)
  const box = (await page.locator('canvas').boundingBox())!
  const level = async ([fx, fy]: readonly [number, number]) =>
    meanBrightness(page, { x: box.x + box.width * fx - PATCH / 2, y: box.y + box.height * fy - PATCH / 2, width: PATCH, height: PATCH })
  const top = await level(FACES.top)
  const front = await level(FACES.front)
  const right = await level(FACES.right)
  console.log(`face brightness top ${top.toFixed(1)} front ${front.toFixed(1)} right ${right.toFixed(1)} ratios ${(front / top).toFixed(3)} ${(right / top).toFixed(3)}`)
  expect(front / top).toBeGreaterThan(0.69)
  expect(front / top).toBeLessThan(0.81)
  expect(right / top).toBeGreaterThan(0.49)
  expect(right / top).toBeLessThan(0.61)
})
