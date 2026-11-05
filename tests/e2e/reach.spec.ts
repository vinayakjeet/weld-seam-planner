import { readFileSync } from 'node:fs'
import type { Locator, Page } from '@playwright/test'
import { jobSchema } from '../../src/core/job/schema'
import { DEFAULT_ARM } from '../../src/core/snake/arm'
import { counts, downloadJson, expect, expectedSeams, field, loadSample, placePort, runReach, sampleById, seamRows, selectAllRows, statusBar, test } from './helpers'

const tank = sampleById('tank-with-manhole')
const SEAMS = expectedSeams(tank)
const SPRAY = 'WPS-GMAW-SPRAY-FW6'
// The seam on the manhole side face of the stiffener at x 746, and the station pinned reachable in the unit tests.
const STIFFENER = 'S16'
const STATION_MM = '630.7'
// The coaming loop around the manhole is the one standard seam; the other 20 need the arm.
const SNAKE_SEAMS = 20

const rowOf = (page: Page, label: string): Locator => seamRows(page).filter({ has: page.getByRole('cell', { name: label, exact: true }) })

test('places a port, measures reach, plays the insertion and exports a job and a RAPID template for tank-with-manhole', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('/')
  await loadSample(page, tank)
  expect(SEAMS).toBe(21)

  await page.getByRole('slider', { name: 'Confidence threshold' }).fill('0')
  await page.getByRole('button', { name: 'Accept all above 0.00' }).click()
  await expect(statusBar(page)).toContainText(counts(SEAMS, 0))

  await page.getByRole('button', { name: /Procedures/ }).click()
  await selectAllRows(page)
  await page.getByLabel('Welding procedure').selectOption({ value: SPRAY })
  await expect(page.getByRole('table', { name: 'Seams' }).getByRole('cell', { name: SPRAY })).toHaveCount(SEAMS)

  await page.getByRole('button', { name: /Access/ }).click()
  await placePort(page)
  await expect(page.getByRole('listitem', { name: 'Port P1' })).toContainText('Direction 0, 0, -1')
  await field(page, 'P1 X', '400')
  await field(page, 'P1 Y', '500')
  await field(page, 'P1 Z', '1000')
  await expect(page.getByLabel('P1 Diameter', { exact: true })).toHaveValue('600')
  await expect(page.getByLabel('P1 Z', { exact: true })).toHaveValue('1000')

  await runReach(page)
  await page.screenshot({ path: 'test-results/reach-tank.png' })

  await rowOf(page, STIFFENER).locator('[data-access="snake"]').hover()
  await expect(page.getByRole('tooltip').getByText(/Snake, \d+ % reached from P1/)).toBeVisible()

  await rowOf(page, STIFFENER).getByRole('cell', { name: STIFFENER, exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Inspector' }).getByText(/Reach\s+\d+ % reached from P1/)).toBeVisible()

  await page.getByLabel('Position along seam').fill(STATION_MM)
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

  await page.getByRole('navigation', { name: 'Workflow steps' }).getByRole('button', { name: /Export/ }).click()
  await expect(page.getByText('No errors. Export is ready.')).toBeVisible()
  const exportButton = page.getByRole('button', { name: 'Export', exact: true })
  const { json } = await downloadJson(page, () => exportButton.click())
  const job = jobSchema.parse(json)
  expect(job.access.ports).toEqual([{ id: 'P1', position: [400, 500, 1000], direction: [0, 0, -1], diameterMm: 600 }])
  expect(job.access.arm).toEqual(DEFAULT_ARM)
  const snake = job.seams.filter((s) => s.access.class === 'snake')
  expect(snake).toHaveLength(SNAKE_SEAMS)
  for (const seam of snake) {
    expect(seam.access.portId).toBe('P1')
    expect(seam.access.reachCoverage).toBeGreaterThanOrEqual(0)
    expect(seam.access.reachCoverage).toBeLessThanOrEqual(1)
  }
  const coaming = job.seams.filter((s) => s.access.class === 'standard')
  expect(coaming).toHaveLength(1)
  expect(coaming[0]!.access.reachCoverage).toBeNull()
  const short = snake.filter((s) => (s.access.reachCoverage ?? 0) < 1).map((s) => s.id).sort()
  const warned = job.validation.warnings.filter((w) => w.code === 'SNAKE_UNREACHABLE').map((w) => w.seamId).sort()
  expect(warned).toEqual(short)

  await page.getByRole('button', { name: 'More export options' }).click()
  const rapid = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'ABB RAPID (.mod)' }).click()])
  expect(rapid[0].suggestedFilename()).toMatch(/\.mod$/)
  const mod = readFileSync((await rapid[0].path())!, 'utf8')
  expect(mod).toContain('MODULE WeldJob_')
  expect(mod).toMatch(/template/i)
  expect(mod.match(/ArcLStart/g)).toHaveLength(1)
  const notIncluded = mod.split('\n').find((l) => l.includes('! Not included:'))!
  expect(notIncluded.split('), ')).toHaveLength(SNAKE_SEAMS)

  // The what-if of the demo: a looser bend limit makes the earlier result stale and reaches more of the stiffener seam.
  await page.getByRole('button', { name: /Access/ }).click()
  await field(page, 'Bend limit', '25')
  await expect(page.getByText(/changed since the last run/)).toBeVisible()
  // The stiffener seam is still selected, so reach runs on that one seam only.
  await runReach(page, /Run reach on 1 selected seam/, /Reach measured for 1 seam in/)
  await rowOf(page, STIFFENER).locator('[data-access="snake"]').hover()
  await expect(page.getByRole('tooltip').getByText('Snake, 100 % reached from P1')).toBeVisible()
})
