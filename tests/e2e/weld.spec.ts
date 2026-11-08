import { expect, seamRows, test } from './helpers'
import { loadSoup, transformSoup } from '../unit/helpers/models'
import { perturbSoup } from '../unit/helpers/noise'
import { makeBinaryStl } from '../unit/helpers/stl'

// The pipe on a plate with every vertex moved by up to 0.02 mm, as a scan or a lossy export might leave it.
function noisyPipe(): Buffer {
  const soup = perturbSoup(transformSoup(loadSoup('pipe-on-plate'), {}), 0.02, 1)
  const tris: number[][] = []
  for (let i = 0; i < soup.length; i += 9) tris.push(Array.from(soup.slice(i, i + 9)))
  return Buffer.from(makeBinaryStl(tris, 'noisy'))
}

test('a raised weld tolerance removes the short creases a noisy mesh gains, and the part is loaded again', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"][accept*=".stl"]').setInputFiles({ name: 'noisy-pipe.stl', mimeType: 'model/stl', buffer: noisyPipe() })
  await expect(seamRows(page).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  const before = await seamRows(page).count()
  expect(before, 'the noise adds creases at the default tolerance').toBeGreaterThan(2)

  await page.getByRole('tab', { name: 'Detection' }).click()
  await expect(page.getByText(/Two bodies count as touching up to 0\.\d+ mm apart on this part/)).toBeVisible()
  await page.getByText('Advanced').click()
  const field = page.getByLabel('Weld tolerance')
  await expect(field).toHaveValue(/^0\.0022/)
  await expect(page.getByText('Raise it for scanned or noisy meshes.')).toBeVisible()
  await field.fill('0.12')
  await field.press('Enter')
  await page.getByRole('tab', { name: 'Seams' }).click()
  await expect(seamRows(page)).toHaveCount(2, { timeout: 30_000 })
  await page.getByRole('tab', { name: 'Detection' }).click()
  await page.getByText('Advanced').click()
  await expect(field).toHaveValue('0.12')

  // A value outside the range is explained and the box goes back to the tolerance in use.
  await field.fill('50')
  await field.press('Enter')
  await expect(page.getByRole('alert')).toContainText('was not used')
  await page.getByRole('tab', { name: 'Seams' }).click()
  await expect(seamRows(page)).toHaveCount(2)
})
