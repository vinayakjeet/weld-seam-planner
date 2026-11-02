import { counts, expect, expectedSeams, loadSample, sampleById, seamRows, statusBar, test } from './helpers'
import type { Page } from '@playwright/test'

const tJoint = sampleById('t-joint-merged')
const SEAMS = expectedSeams(tJoint)

const loadTJoint = (page: Page) => loadSample(page, tJoint)

// Drops a text file the way a browser does (dragover, then drop) and says whether the page cancelled each event.
// An uncancelled drop on a link-less page makes the browser open the file and leave the app.
async function dropTextFile(page: Page, selector: string, name: string) {
  return page.evaluate(
    ({ selector, name }) => {
      const target = document.querySelector(selector)
      if (!target) throw new Error(`nothing matches ${selector}`)
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(new File(['this is plain text, not an STL\n'], name, { type: 'text/plain' }))
      const init = { bubbles: true, cancelable: true, dataTransfer }
      const overCancelled = !target.dispatchEvent(new DragEvent('dragover', init))
      const dropCancelled = !target.dispatchEvent(new DragEvent('drop', init))
      return { overCancelled, dropCancelled }
    },
    { selector, name },
  )
}

test('loads the T-joint, accepts every seam above 0.70 and undoes it', async ({ page }) => {
  await page.goto('/')
  await loadTJoint(page)
  await expect(statusBar(page)).toContainText(counts(0, SEAMS))

  await page.getByRole('button', { name: 'Accept all above 0.70' }).click()
  await expect(statusBar(page)).toContainText(counts(SEAMS, 0))
  await expect(statusBar(page)).toContainText(/Weld length\s*400 mm/)

  await page.keyboard.press('Control+z')
  await expect(statusBar(page)).toContainText(counts(0, SEAMS))
  await expect(statusBar(page)).toContainText(/Weld length\s*0 mm/)
})

test('a file that is not an STL shows the error alert, and the next sample still loads', async ({ page }) => {
  await page.goto('/')

  const { dropCancelled } = await dropTextFile(page, '[aria-label="Import a part"]', 'notes.txt')
  expect(dropCancelled).toBe(true)

  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('This file does not look like an STL.')
  await expect(alert.locator('p')).toHaveCount(3)
  await expect(seamRows(page)).toHaveCount(0)

  await loadTJoint(page)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(statusBar(page)).toContainText(counts(0, SEAMS))
})

test('a file dropped on a side panel is handled by the app instead of opening in the browser', async ({ page }) => {
  await page.goto('/')
  const panel = 'aside[aria-label="Seam list"]'

  const first = await dropTextFile(page, panel, 'notes.txt')
  expect(first).toEqual({ overCancelled: true, dropCancelled: true })
  await expect(page.getByRole('alert')).toContainText('This file does not look like an STL.')

  await loadTJoint(page)
  const second = await dropTextFile(page, panel, 'notes.txt')
  expect(second).toEqual({ overCancelled: true, dropCancelled: true })
  await expect(page.getByRole('heading', { name: 'Drop an STL file or pick a sample' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(seamRows(page)).toHaveCount(SEAMS)
})
