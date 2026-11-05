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

test('a long sequence list draws only the rows in view, follows a row moved by key and keeps a dragged row', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"][accept*=".stl"]').setInputFiles({ name: 'blocks.stl', mimeType: 'model/stl', buffer: Buffer.from(blocksOnPlate(14, 12)) })
  const seamsTable = page.getByRole('table', { name: 'Seams' })
  await expect(seamsTable).toHaveAttribute('aria-rowcount', /^\d+$/, { timeout: 60_000 })
  const total = Number(await seamsTable.getAttribute('aria-rowcount')) - 1
  await page.getByRole('slider', { name: 'Confidence threshold' }).fill('0')
  await page.getByRole('button', { name: 'Accept all above 0.00' }).click()

  await page.getByRole('button', { name: /Sequence/ }).click()
  const table = page.getByRole('table', { name: 'Sequence' })
  await expect(table).toHaveAttribute('aria-rowcount', String(total + 1))
  const rows = table.getByRole('row').filter({ has: page.getByRole('cell') })
  expect(await rows.count(), 'only the rows in view and a few around them are in the page').toBeLessThan(60)
  const body = table.locator('div.overflow-y-auto')

  // Alt and the down arrow carry the bottom visible row past the edge of the box; it keeps the focus and stays in view.
  const box = (await body.boundingBox())!
  const bottom = rows.filter({ has: page.getByRole('cell') }).locator(`xpath=self::*[@aria-rowindex]`)
  const visible = await bottom.evaluateAll((els, limit) => els.filter((el) => el.getBoundingClientRect().bottom <= limit).map((el) => el.getAttribute('data-seam-id')), box.y + box.height)
  const id = visible[visible.length - 1]!
  const moved = table.locator(`[data-seam-id="${id}"]`)
  const start = Number(await moved.getAttribute('aria-rowindex'))
  await moved.focus()
  for (let k = 0; k < 30; k++) await page.keyboard.press('Alt+ArrowDown')
  await expect(moved).toHaveAttribute('aria-rowindex', String(start + 30))
  await expect(moved).toBeFocused()
  const after = (await moved.boundingBox())!
  expect(after.y).toBeGreaterThanOrEqual(box.y - 1)
  expect(after.y + after.height).toBeLessThanOrEqual(box.y + box.height + 1)

  // A row dragged from the top stays in the page while the list scrolls to the end, and drops on the last row.
  await body.evaluate((el) => {
    el.scrollTop = 0
  })
  const first = rows.first()
  const dragged = (await first.getAttribute('data-seam-id'))!
  const transfer = await page.evaluateHandle(() => new DataTransfer())
  await first.dispatchEvent('dragstart', { dataTransfer: transfer })
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await expect(rows.last()).toHaveAttribute('aria-rowindex', String(total + 1))
  await expect(table.locator(`[data-seam-id="${dragged}"]`)).toHaveCount(1)
  const target = rows.last()
  await target.dispatchEvent('dragover', { dataTransfer: transfer })
  await target.dispatchEvent('drop', { dataTransfer: transfer })
  await expect(table.locator(`[data-seam-id="${dragged}"]`)).toHaveAttribute('aria-rowindex', String(total + 1))
})
