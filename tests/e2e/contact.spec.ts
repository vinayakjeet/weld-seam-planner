import { counts, expect, expectedSeams, loadSample, sampleById, seamRows, statusBar, test } from './helpers'

const assembly = sampleById('t-joint-assembly')
const SEAMS = assembly.expectedContactSeams

const positionChips = (page: Parameters<typeof seamRows>[0]) => seamRows(page).getByTestId('position-chip')

test('t-joint-assembly lists its contact seams as fillets, accepts them together and reads PB for both', async ({ page }) => {
  expect(SEAMS, 'the manifest should expect contact seams for this sample').toBeGreaterThan(0)
  expect(expectedSeams(assembly)).toBe(SEAMS)
  await page.goto('/')
  await loadSample(page, assembly)

  const rows = seamRows(page)
  await expect(rows).toHaveCount(SEAMS)
  for (let i = 0; i < SEAMS; i++) await expect(rows.nth(i).getByRole('cell').nth(2)).toHaveText('Fillet')
  await expect(statusBar(page)).toContainText(counts(0, SEAMS))

  await page.getByRole('button', { name: 'Accept all above 0.70' }).click()
  await expect(statusBar(page)).toContainText(counts(SEAMS, 0))

  await expect(positionChips(page)).toHaveCount(SEAMS)
  for (let i = 0; i < SEAMS; i++) await expect(positionChips(page).nth(i)).toHaveText('PB')
})

test('changing the gravity to X up turns the same seams vertical without detecting again, and Z up brings PB back', async ({ page }) => {
  await page.goto('/')
  await loadSample(page, assembly)
  await expect(positionChips(page).first()).toHaveText('PB')

  await page.getByLabel('Gravity', { exact: true }).selectOption('X up')
  for (let i = 0; i < SEAMS; i++) await expect(positionChips(page).nth(i)).toHaveText('PF')
  await expect(seamRows(page)).toHaveCount(SEAMS)
  await expect(page.getByRole('progressbar')).toHaveCount(0)

  await page.getByLabel('Gravity', { exact: true }).selectOption('Z up')
  for (let i = 0; i < SEAMS; i++) await expect(positionChips(page).nth(i)).toHaveText('PB')
})
