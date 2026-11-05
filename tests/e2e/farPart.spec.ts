import { expect, seamRows, test } from './helpers'
import { findColour, hexToRgb } from './pixels'
import { makeBinaryStl } from '../unit/helpers/stl'
import { loadSoup, transformSoup } from '../unit/helpers/models'

// The T-joint as a binary STL, moved along x; a CAD export in plant coordinates sits kilometres from its origin.
function tJointAt(x: number): Buffer {
  const soup = transformSoup(loadSoup('t-joint-merged'), { translate: [x, 0, 0] })
  const tris: number[][] = []
  for (let i = 0; i < soup.length; i += 9) tris.push(Array.from(soup.slice(i, i + 9)))
  return Buffer.from(makeBinaryStl(tris, 'far'))
}

// Where the first candidate seam pixel is drawn on the canvas, once the fit has flown the camera to the part at x.
async function candidateAt(page: import('@playwright/test').Page, x: number) {
  await page.goto('/')
  await page.locator('input[type="file"][accept*=".stl"]').setInputFiles({ name: `t-${x}.stl`, mimeType: 'model/stl', buffer: tJointAt(x) })
  await expect(seamRows(page)).toHaveCount(2, { timeout: 30_000 })
  // From 2 km away the camera needs a moment longer to settle.
  await page.waitForTimeout(2500)
  const canvas = (await page.locator('canvas').boundingBox())!
  const colour = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--seam-candidate').trim())
  return { at: await findColour(page, canvas, hexToRgb(colour), 30), canvas }
}

// Before the display origin, a part this far out was not drawn at all.
test('draws a part 2 km from its origin where the same part at the origin is drawn, and picks its seams', async ({ page }) => {
  const near = await candidateAt(page, 0)
  const far = await candidateAt(page, 2_000_000)
  expect(near.at, 'the seams are drawn at the origin').not.toBeNull()
  expect(far.at, 'the seams are drawn 2 km out').not.toBeNull()
  expect(Math.abs(far.at!.x - near.at!.x)).toBeLessThan(4)
  expect(Math.abs(far.at!.y - near.at!.y)).toBeLessThan(4)

  // A click on the drawn seam picks it: the ray meets the part in the world group placed at the display origin. The
  // middle of the canvas, top to bottom, crosses the front seam.
  const selected = seamRows(page).and(page.locator('[aria-selected="true"]'))
  await expect(selected).toHaveCount(0)
  for (let y = 0.35; y < 0.85 && (await selected.count()) === 0; y += 0.005) {
    await page.mouse.click(far.canvas.x + far.canvas.width / 2, far.canvas.y + far.canvas.height * y)
  }
  await expect(selected).toHaveCount(1)
})
