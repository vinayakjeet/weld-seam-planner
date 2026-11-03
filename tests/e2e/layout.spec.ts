import { expectedSeams, expect, loadSample, sampleById, seamRows, statusBar, test } from './helpers'

const cell = sampleById('double-bottom-cell')

test('the last seam row of double-bottom-cell scrolls fully into view above the status bar', async ({ page }) => {
  await page.goto('/')
  await loadSample(page, cell)
  const rows = seamRows(page)
  await expect(rows).toHaveCount(expectedSeams(cell))

  const last = rows.last()
  await last.scrollIntoViewIfNeeded()
  const row = await last.boundingBox()
  const footer = await statusBar(page).boundingBox()
  const table = await page.getByRole('table', { name: 'Seams' }).boundingBox()
  if (!row || !footer || !table) throw new Error('the last row, the table and the status bar should all be on screen')

  expect(row.y + row.height, 'the last row ends above the status bar').toBeLessThanOrEqual(footer.y + 0.5)
  expect(table.y + table.height, 'the table ends above the status bar').toBeLessThanOrEqual(footer.y + 0.5)
  await expect(last).toBeInViewport({ ratio: 1 })
})

test('the table scrolls on its own: the panel around it does not', async ({ page }) => {
  await page.goto('/')
  await loadSample(page, cell)
  const panel = page.getByRole('complementary', { name: 'Seam list' })
  const { scrollHeight, clientHeight } = await panel.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }))
  expect(scrollHeight).toBeLessThanOrEqual(clientHeight)
})
