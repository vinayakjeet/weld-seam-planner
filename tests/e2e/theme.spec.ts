import { mkdirSync } from 'node:fs'
import { STEPS } from '../../src/state/store'
import { expect, loadSample, sampleById, test } from './helpers'

test.setTimeout(180_000)

const backgroundOf = (page: import('@playwright/test').Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

test('the theme button switches between the dark and light tokens and the choice survives a reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const dark = await backgroundOf(page)

  await page.getByRole('button', { name: 'Switch to the light theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const light = await backgroundOf(page)
  expect(light).not.toBe(dark)
  await expect(page.getByRole('button', { name: 'Switch to the dark theme' })).toBeVisible()
  await expect(page.getByAltText('Armatrix')).toHaveAttribute('src', /dark-forest/)

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await backgroundOf(page)).toBe(light)

  await page.getByRole('button', { name: 'Switch to the dark theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await backgroundOf(page)).toBe(dark)
})

test('double-bottom-cell in the light theme: every step is photographed and the viewport follows the theme', async ({ page }) => {
  mkdirSync('test-results/theme', { recursive: true })
  await page.goto('/')
  await loadSample(page, sampleById('double-bottom-cell'))
  await page.getByRole('slider', { name: 'Confidence threshold' }).fill('0')
  await page.getByRole('button', { name: 'Accept all above 0.00' }).click()
  const canvas = page.locator('canvas').first()

  await page.getByRole('navigation', { name: 'Workflow steps' }).getByRole('button', { name: 'Seams' }).click()
  await page.waitForTimeout(600)
  const darkShot = await canvas.screenshot()

  await page.getByRole('button', { name: 'Switch to the light theme' }).click()
  await page.waitForTimeout(600)
  const lightShot = await canvas.screenshot()
  expect(lightShot.equals(darkShot), 'the canvas was redrawn in the light theme').toBe(false)

  for (const [index, step] of STEPS.entries()) {
    await page.getByRole('navigation', { name: 'Workflow steps' }).getByRole('button', { name: step.label }).click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `test-results/theme/double-bottom-cell-light-${index + 1}-${step.id}.png` })
  }
})
