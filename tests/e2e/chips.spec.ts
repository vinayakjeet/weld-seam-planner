import { expect, expectedSeams, loadSample, sampleById, seamRows, test } from './helpers'

const tJoint = sampleById('t-joint-merged')
const SEAMS = expectedSeams(tJoint)

test('the Accepted and Candidates chips filter the seam rows and the part name opens the import step', async ({ page }) => {
  await page.goto('/')
  await loadSample(page, tJoint)
  await expect(seamRows(page)).toHaveCount(SEAMS)

  await page.getByRole('row', { name: /Accept seam/ }).first().getByRole('button', { name: /Accept seam/ }).click()
  const accepted = page.getByRole('button', { name: 'Accepted', exact: true })
  await accepted.click()
  await expect(accepted).toHaveAttribute('aria-pressed', 'true')
  await expect(seamRows(page)).toHaveCount(1)

  await accepted.click()
  const candidates = page.getByRole('button', { name: 'Candidates', exact: true })
  await candidates.click()
  await expect(seamRows(page)).toHaveCount(SEAMS - 1)

  await candidates.click()
  await expect(seamRows(page)).toHaveCount(SEAMS)

  await page.getByRole('button', { name: /Open another part/ }).click()
  await expect(page.getByRole('heading', { name: 'Drop an STL file or pick a sample' })).toBeVisible()
})
