import { readFileSync } from 'node:fs'
import { expect, loadSample, sampleById, test } from './helpers'
import { countColour, hexToRgb } from './pixels'

const tokens = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8')
// The view cube is drawn in --bg-2, which is Dark Forest T3.
const CUBE = hexToRgb(/--dark-forest-t3:\s*(#[0-9A-Fa-f]{6})/.exec(tokens)![1]!)
const TOLERANCE = 5
const RING_PX = 2
const CUBE_SPAN = 140

test('the view cube sits inside the canvas at 1280 x 720 and does not touch its top or right edge', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await loadSample(page, sampleById('t-joint-merged'))
  await page.waitForTimeout(800)
  const box = (await page.locator('canvas').boundingBox())!

  const cube = await countColour(page, { x: box.x + box.width - CUBE_SPAN, y: box.y + RING_PX, width: CUBE_SPAN - RING_PX, height: CUBE_SPAN }, CUBE, TOLERANCE)
  expect(cube, 'the cube is drawn in the top right corner').toBeGreaterThan(300)

  const top = await countColour(page, { x: box.x + box.width - CUBE_SPAN, y: box.y, width: CUBE_SPAN, height: RING_PX }, CUBE, TOLERANCE)
  const right = await countColour(page, { x: box.x + box.width - RING_PX, y: box.y, width: RING_PX, height: CUBE_SPAN }, CUBE, TOLERANCE)
  expect(top, 'no cube pixel on the top edge').toBe(0)
  expect(right, 'no cube pixel on the right edge').toBe(0)
})
