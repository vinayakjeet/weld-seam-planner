import { jobSchema } from '../../src/core/job/schema'
import { counts, downloadJson, expect, expectedSeams, loadSample, sampleById, selectAllRows, statusBar, test } from './helpers'

const cell = sampleById('double-bottom-cell')
const SEAMS = expectedSeams(cell)
const SPRAY = 'WPS-GMAW-SPRAY-FW6'

// The timeline readout is "m:ss / m:ss", or "h:mm:ss" from one hour.
const seconds = (text: string) => text.split(':').reduce((total, part) => total * 60 + Number(part), 0)

test('optimises, plays and exports a balanced-heat sequence on double-bottom-cell', async ({ page }) => {
  await page.goto('/')
  await loadSample(page, cell)

  await page.getByRole('slider', { name: 'Confidence threshold' }).fill('0')
  await page.getByRole('button', { name: 'Accept all above 0.00' }).click()
  await expect(statusBar(page)).toContainText(counts(SEAMS, 0))

  await page.getByRole('button', { name: /Procedures/ }).click()
  await selectAllRows(page)
  await page.getByLabel('Welding procedure').selectOption({ value: SPRAY })
  await expect(page.getByRole('table', { name: 'Seams' }).getByRole('cell', { name: SPRAY })).toHaveCount(SEAMS)

  await page.getByRole('button', { name: /Sequence/ }).click()
  await page.getByLabel('Sequence strategy').selectOption({ label: 'Balanced heat' })
  await page.getByRole('button', { name: 'Optimise' }).click()
  await expect(page.getByText('Current order: balanced heat.')).toBeVisible()

  const readout = page.getByTestId('playback-time')
  await expect(readout).toContainText(/0:00 \/ \d/)
  const total = seconds(((await readout.innerText()).split('/')[1] ?? '').trim())
  expect(total).toBeGreaterThan(0)

  await page.getByRole('radio', { name: '20x' }).click()
  await page.getByRole('button', { name: 'Play' }).click()
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: 'Pause' }).click()
  const played = seconds(((await readout.innerText()).split('/')[0] ?? '').trim())
  expect(played).toBeGreaterThan(0)
  expect(played).toBeLessThan(total)

  await page.getByRole('navigation', { name: 'Workflow steps' }).getByRole('button', { name: /Export/ }).click()
  await expect(page.getByText('No errors. Export is ready.')).toBeVisible()
  const exportButton = page.getByRole('button', { name: 'Export', exact: true })
  await expect(exportButton).toBeEnabled()
  const { json } = await downloadJson(page, () => exportButton.click())

  const job = jobSchema.parse(json)
  expect(job.sequence.strategy).toBe('balanced-heat')
  expect(job.seams).toHaveLength(SEAMS)
  expect(job.sequence.order).toHaveLength(SEAMS)
  const ids = job.seams.map((seam) => seam.id)
  expect(job.sequence.order.map((entry) => entry.seamId).sort()).toEqual([...ids].sort())
  expect(new Set(ids).size).toBe(SEAMS)

  for (const seam of job.seams) {
    expect(seam.access.class).not.toBeNull()
    expect(seam.access.nearClearanceDeg).not.toBeNull()
  }
  const classes = new Set(job.seams.map((seam) => seam.access.class))
  expect(classes.has('snake')).toBe(true)
  expect(classes.has('blocked')).toBe(true)

  // The class and the pre-flight warning must agree: a blocked seam has the warning, and a warning names a blocked seam
  // or one with stretches outside the arm's reach.
  const warned = new Set(job.validation.warnings.filter((w) => w.code === 'ACCESS_BLOCKED').map((w) => w.seamId))
  for (const seam of job.seams) {
    const shouldWarn = seam.access.class === 'blocked' || seam.access.unreachable.length > 0
    expect(warned.has(seam.id), `ACCESS_BLOCKED warning for ${seam.id} (${seam.access.class})`).toBe(shouldWarn)
  }
  expect(warned.size).toBeGreaterThan(0)
})
