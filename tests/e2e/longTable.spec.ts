import { expect, seamRows, test } from './helpers'
import { makeBinaryStl } from '../unit/helpers/stl'
import { cubeTriangles } from '../unit/helpers/shapes'

test.setTimeout(180_000)

// A plate with a grid of separate blocks standing on it: every block touches the plate, so the table gets a long list.
function blocksOnPlate(columns: number, rows: number): ArrayBuffer {
  const pitch = 30
  const tris = cubeTriangles([0, 0, -10], [columns * pitch + 10, rows * pitch + 10, 10])
  for (let c = 0; c < columns; c++) for (let r = 0; r < rows; r++) tris.push(...cubeTriangles([10 + c * pitch, 10 + r * pitch, 0], [15, 15, 15]))
  return makeBinaryStl(tris, 'blocks')
}

test('a long seam table draws only the rows in view, keeps its scroll bar and scrolls to the selected seam', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"][accept*=".stl"]').setInputFiles({ name: 'blocks.stl', mimeType: 'model/stl', buffer: Buffer.from(blocksOnPlate(14, 12)) })

  const table = page.getByRole('table', { name: 'Seams' })
  await expect(table).toHaveAttribute('aria-rowcount', /^\d+$/, { timeout: 60_000 })
  const total = Number(await table.getAttribute('aria-rowcount')) - 1
  expect(total, 'the part gives a list long enough to be windowed').toBeGreaterThan(120)

  const drawn = await seamRows(page).count()
  expect(drawn, 'only the rows in view and a few around them are in the page').toBeLessThan(60)
  expect(drawn).toBeGreaterThan(5)

  // Scrolling to the end draws the last row and a row near the top is gone.
  const body = table.locator('div.overflow-y-auto')
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await expect(seamRows(page).last()).toHaveAttribute('aria-rowindex', String(total + 1))
  await expect(seamRows(page).first()).not.toHaveAttribute('aria-rowindex', '2')
  expect(await seamRows(page).count()).toBeLessThan(60)

  // A row that is drawn can be selected, and the table keeps the selected row in view.
  await seamRows(page).last().getByRole('cell').first().click()
  await expect(seamRows(page).last()).toHaveAttribute('aria-selected', 'true')
  await body.evaluate((el) => {
    el.scrollTop = 0
  })
  await expect(seamRows(page).first()).toHaveAttribute('aria-rowindex', '2')
})
