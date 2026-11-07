import type { Locator } from '@playwright/test'
import { expectedSeams, expect, loadSample, sampleById, seamRows, selectAllRows, statusBar, test } from './helpers'

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

// For each row, how far the text of the given cell runs past the cell's own box, in pixels.
const overflowOf = (table: Locator, column: number) =>
  table.evaluate((el, i) => {
    const rows = [...el.querySelectorAll('[role="row"]')].filter((row) => row.querySelector('[role="cell"]'))
    return rows.map((row) => {
      const cell = row.querySelectorAll('[role="cell"]')[i]!
      const range = document.createRange()
      range.selectNodeContents(cell)
      return { text: cell.textContent, over: Math.round(range.getBoundingClientRect().width - cell.getBoundingClientRect().width) }
    })
  }, column)

test('the seam table and the sequence list show each length and WPS code in full on tank-with-manhole', async ({ page }) => {
  const tank = sampleById('tank-with-manhole')
  await page.goto('/')
  await loadSample(page, tank)
  await page.getByRole('slider', { name: 'Confidence threshold' }).fill('0')
  await page.getByRole('button', { name: 'Accept all above 0.00' }).click()
  const steps = page.getByRole('navigation', { name: 'Workflow steps' })
  await steps.getByRole('button', { name: /Procedures/ }).click()
  await selectAllRows(page)
  await page.getByLabel('Welding procedure').selectOption({ value: 'WPS-GMAW-SPRAY-FW6' })

  const seams = page.getByRole('table', { name: 'Seams' })
  await expect(seams.getByRole('cell', { name: 'WPS-GMAW-SPRAY-FW6' })).toHaveCount(expectedSeams(tank))
  const lengths = await overflowOf(seams, 3)
  expect(lengths.map((c) => c.text)).toContain('1935.2')
  expect(lengths.filter((c) => c.over > 0)).toEqual([])
  expect((await overflowOf(seams, 4)).filter((c) => c.over > 0)).toEqual([])

  await steps.getByRole('button', { name: /Sequence/ }).click()
  const sequence = page.getByRole('table', { name: 'Sequence' })
  await expect(sequence.getByRole('row')).toHaveCount(expectedSeams(tank) + 1)
  expect((await overflowOf(sequence, 3)).filter((c) => c.over > 0)).toEqual([])
})
