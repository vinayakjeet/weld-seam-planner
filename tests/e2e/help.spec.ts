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
