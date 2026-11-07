import { expect, loadSample, sampleById, test } from './helpers'

const steps = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Workflow steps' })
// The sheet hides the page from the accessibility tree, so the open step is read from the DOM.
const current = (page: import('@playwright/test').Page) => page.locator('nav[aria-label="Workflow steps"] button[aria-current="step"]')

test('the shortcut sheet lists the keys, blocks the step keys while open and closes on Escape', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Six steps: Import, Seams, Procedures, Access, Sequence, Export.')).toBeVisible()
  await expect(current(page)).toContainText('Import')

  await page.keyboard.press('?')
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Fit view')).toBeVisible()
  await expect(sheet.getByText('Go to Access')).toBeVisible()
  await expect(sheet.getByText('Go to Export')).toBeVisible()
  // A key cap holds only the key; the word between two caps is plain text.
  await expect(sheet.locator('kbd', { hasText: /^or\b/ })).toHaveCount(0)
  await expect(sheet.locator('kbd', { hasText: 'Cmd+E' })).toHaveText('Cmd+E')

  await page.keyboard.press('2')
  await expect(current(page)).toContainText('Import')
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(current(page)).toContainText('Import')

  await page.keyboard.press('3')
  await expect(current(page)).toContainText('Procedures')

  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  await expect(sheet).toBeVisible()
  await page.keyboard.press('?')
  await expect(sheet).toHaveCount(0)
})

// The keys belong to the page, not to the 3D view, which loads as its own chunk and mounts later.
test('? opens the sheet as soon as the start screen shows, before the 3D view has mounted', async ({ page }) => {
  for (let visit = 0; visit < 4; visit++) {
    await page.goto('/')
    await expect(page.getByText('Six steps: Import, Seams, Procedures, Access, Sequence, Export.')).toBeVisible()
    await page.keyboard.press('?')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' }), `visit ${visit + 1}`).toBeVisible({ timeout: 1000 })
  }
})

test('the camera keys turn the view once the 3D view is there', async ({ page }) => {
  await page.goto('/')
  await loadSample(page, sampleById('t-joint-merged'))
  const canvas = page.locator('canvas').first()
  const shot = async () => {
    await page.waitForTimeout(400)
    return canvas.screenshot()
  }
  const start = await shot()
  await page.keyboard.press('Shift+5')
  const top = await shot()
  expect(top.equals(start), 'Shift+5 shows the top view').toBe(false)
  await page.mouse.move(700, 450)
  await page.mouse.wheel(0, -600)
  const zoomed = await shot()
  await page.keyboard.press('f')
  expect((await shot()).equals(zoomed), 'F fits the part again').toBe(false)
})

test('Escape that closes the sheet leaves an armed tool armed', async ({ page }) => {
  await page.goto('/')
  await loadSample(page, sampleById('t-joint-merged'))
  const draw = page.getByRole('button', { name: /^Draw/ })
  await page.keyboard.press('d')
  await expect(draw).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0)
  await expect(draw).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(draw).toHaveAttribute('aria-pressed', 'false')
})

test('? and digits typed into a field are text, not shortcuts', async ({ page }) => {
  await page.goto('/')
  await loadSample(page, sampleById('t-joint-merged'))
  await steps(page).getByRole('button', { name: /Access/ }).click()
  const links = page.getByRole('textbox', { name: 'Links' })
  await links.fill('')
  await links.pressSequentially('?5')
  await expect(links).toHaveValue('?5')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0)
  await expect(steps(page).getByRole('button', { name: /Access/ })).toHaveAttribute('aria-current', 'step')
})
