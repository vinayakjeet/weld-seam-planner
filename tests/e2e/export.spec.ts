import { counts, downloadJson, expect, expectedSeams, loadSample, sampleById, selectAllRows, statusBar, test } from './helpers'

const cell = sampleById('double-bottom-cell')
const SEAMS = expectedSeams(cell)
const SPRAY = 'WPS-GMAW-SPRAY-FW6'

interface Pose {
  quaternion: [number, number, number, number]
}

interface ExportedJob {
  seams: Array<{ poses: Pose[]; access: { class: string | null; nearClearanceDeg: number | null } }>
  units: Record<string, string>
  validation: { errors: unknown[] }
}

test('exports a validated job from double-bottom-cell', async ({ page }) => {
  await page.goto('/')
  await loadSample(page, cell)

  await page.getByRole('slider', { name: 'Confidence threshold' }).fill('0')
  await page.getByRole('button', { name: 'Accept all above 0.00' }).click()
  await expect(statusBar(page)).toContainText(counts(SEAMS, 0))

  await page.getByRole('button', { name: /Procedures/ }).click()
  await selectAllRows(page)
  await page.getByLabel('Welding procedure').selectOption({ value: SPRAY })
  const wpsCells = page.getByRole('table', { name: 'Seams' }).getByRole('cell', { name: SPRAY })
  await expect(wpsCells).toHaveCount(SEAMS)

  await page.getByRole('button', { name: /Validate and Export/ }).click()
  await expect(page.getByText('No errors. Export is ready.')).toBeVisible()
  const exportButton = page.getByRole('button', { name: 'Export', exact: true })
  await expect(exportButton).toBeEnabled()

  const { name, json } = await downloadJson(page, () => exportButton.click())
  expect(name).toMatch(/^weldjob-double-bottom-cell-\d{4}-\d{2}-\d{2}\.json$/)

  const job = json as ExportedJob
  expect(job.seams).toHaveLength(SEAMS)
  // Blocked seams are warnings, not errors, so they still export; every seam carries its class and near clearance.
  for (const seam of job.seams) {
    expect(['standard', 'slim', 'snake', 'blocked']).toContain(seam.access.class)
    expect(seam.access.nearClearanceDeg).not.toBeNull()
  }
  expect(job.units).toEqual({
    length: 'mm',
    angle: 'deg',
    time: 's',
    speed: 'mm/s',
    wireFeed: 'm/min',
    gasFlow: 'L/min',
    heatInput: 'kJ/mm',
    mass: 'kg',
  })
  expect(job.validation.errors).toEqual([])
  for (const seam of job.seams) {
    expect(seam.poses.length).toBeGreaterThan(0)
    for (const { quaternion } of seam.poses) {
      expect(Math.abs(Math.hypot(...quaternion) - 1)).toBeLessThan(1e-4)
      expect(quaternion[3]).toBeGreaterThanOrEqual(0)
    }
  }
})
