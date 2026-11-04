import { counts, expect, expectedSeams, field, loadSample, placePort, runReach, sampleById, seamRows, selectAllRows, statusBar, test } from './helpers'
import { countColour, findColour, hexToRgb } from './pixels'

const tank = sampleById('tank-with-manhole')
// Bright Discovery, the colour of an accepted seam.
const ACCEPTED = hexToRgb('#E97F01')

test.setTimeout(180_000)

const SPRAY = 'WPS-GMAW-SPRAY-FW6'
// The seam on the manhole side face of the stiffener at x 746, and the station pinned reachable in the unit tests.
const STIFFENER = 'S16'
const STATION_MM = '630.7'
// The arm is lit, so its colour spreads well around the token value.
const ARM_TOLERANCE = 90

test('placing a port on a spot where a seam lies does not toggle that seam', async ({ page }) => {
  await page.goto('/')
  await loadSample(page, tank)
  await page.getByRole('slider', { name: 'Confidence threshold' }).fill('0')
  await page.getByRole('button', { name: 'Accept all above 0.00' }).click()
  const seams = expectedSeams(tank)
  await expect(statusBar(page)).toContainText(counts(seams, 0))

  await page.getByRole('button', { name: /Access/ }).click()
  const box = (await page.locator('canvas').boundingBox())!
  // Most seams of the tank lie inside it, so X-ray shows them over the part.
  await page.getByRole('button', { name: 'X-ray' }).click()
  await page.mouse.move(box.x + 2, box.y + box.height - 2)
  await page.waitForTimeout(600)
  // The seam lines are the only accent pixels on the canvas; the seam is under the part's surface too, so a click there hits both.
  const spot = await findColour(page, { x: box.x, y: box.y + 60, width: box.width - 120, height: box.height - 60 }, ACCEPTED, 40)
  expect(spot, 'no accepted seam is visible on the canvas').not.toBeNull()

  await page.getByRole('button', { name: 'Add port' }).click()
  await page.mouse.click(spot!.x, spot!.y)
  await expect(page.getByRole('listitem', { name: 'Port P1' })).toBeVisible()
  await expect(statusBar(page)).toContainText(counts(seams, 0))
})

test('the arm is drawn at a reached station, and Insert plays', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('/')
  await loadSample(page, tank)
  await page.getByRole('slider', { name: 'Confidence threshold' }).fill('0')
  await page.getByRole('button', { name: 'Accept all above 0.00' }).click()
  await page.getByRole('button', { name: /Procedures/ }).click()
  await selectAllRows(page)
  await page.getByLabel('Welding procedure').selectOption({ value: SPRAY })
  await page.getByRole('button', { name: /Access/ }).click()
  await placePort(page)
  await field(page, 'P1 X', '400')
  await field(page, 'P1 Y', '500')
  await field(page, 'P1 Z', '1000')
  await runReach(page)

  await page.getByRole('button', { name: 'X-ray' }).click()
  const main = page.getByRole('main', { name: '3D viewport' })
  const box = (await page.locator('canvas').boundingBox())!
  // The seam lines are accent too, so the arm is told apart by what it adds to a view of the same seam without it.
  await seamRows(page).filter({ has: page.getByRole('cell', { name: STIFFENER, exact: true }) }).getByRole('cell', { name: STIFFENER, exact: true }).click()
  await field(page, 'Position along seam', '0')
  await page.waitForTimeout(500)
  const before = await countColour(page, box, ACCEPTED, ARM_TOLERANCE)

  await field(page, 'Position along seam', STATION_MM)
  await expect.poll(async () => Number(await main.getAttribute('data-arm-links'))).toBeGreaterThan(0)
  await page.waitForTimeout(500)
  const after = await countColour(page, box, ACCEPTED, ARM_TOLERANCE)
  expect(after, 'the arm adds snake coloured pixels to the view').toBeGreaterThan(before + 200)

  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  const frame = page.getByRole('slider', { name: 'Insertion frame' })
  await expect(frame).toBeEnabled()
  const max = Number(await frame.getAttribute('max'))
  expect(max).toBeGreaterThan(30)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const at = Number(await frame.inputValue())
  expect(at).toBeGreaterThan(0)
  expect(at).toBeLessThan(max)
})
