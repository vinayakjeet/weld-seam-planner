import { expect, expectedSeams, loadSample, sampleById, seamRows, test } from './helpers'
import { findColour, hexToRgb, meanBrightness } from './pixels'

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

  // The worker was told to share only if this browser's WebGL took a shared buffer, so the picture below is drawn from the
  // memory the worker built in browsers that accept it, and from a copy in those that do not.
  const accepted = await page.evaluate(() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl2')
      if (!gl) return false
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(new SharedArrayBuffer(36)), gl.STATIC_DRAW)
      return gl.getError() === gl.NO_ERROR
    } catch {
      return false
    }
  })
  const names = await Promise.all(page.workers().map((worker) => worker.evaluate(() => self.name)))
  expect(names).toContain(accepted ? 'geometry-shared' : 'geometry-copy')
  console.log(`${test.info().project.name}: WebGL takes shared buffers: ${accepted}`)

  const canvas0 = (await page.locator('canvas').boundingBox())!
  const colour = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--seam-candidate').trim())
  expect(await findColour(page, canvas0, hexToRgb(colour), 30), 'the seams are drawn').not.toBeNull()
  const middle = await meanBrightness(page, { x: canvas0.x + canvas0.width * 0.4, y: canvas0.y + canvas0.height * 0.4, width: canvas0.width * 0.2, height: canvas0.height * 0.2 })
  const corner = await meanBrightness(page, { x: canvas0.x + 4, y: canvas0.y + canvas0.height - 60, width: 60, height: 50 })
  expect(Math.abs(middle - corner), 'the part is drawn against the background').toBeGreaterThan(5)

  // The viewport picks through the BVH the worker built over shared memory.
  const canvas = (await page.locator('canvas').boundingBox())!
  const selected = seamRows(page).and(page.locator('[aria-selected="true"]'))
  await expect(selected).toHaveCount(0)
  for (let y = 0.3; y < 0.9 && (await selected.count()) === 0; y += 0.005) {
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height * y)
  }
  await expect(selected).toHaveCount(1)
})
