import type { Page } from '@playwright/test'
import { counts, expect, expectedSeams, loadSample, sampleById, statusBar, test } from './helpers'

const assembly = sampleById('t-joint-assembly')
const SEAMS = expectedSeams(assembly)

// idb-keyval keeps entries in the "keyval-store" database. The save is debounced, so the tests wait for the entry to appear.
async function waitForSavedPlan(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const open = indexedDB.open('keyval-store')
              open.onerror = () => resolve(0)
              open.onsuccess = () => {
                const db = open.result
                if (!db.objectStoreNames.contains('keyval')) {
                  db.close()
                  resolve(0)
                  return
                }
                const keys = db.transaction('keyval').objectStore('keyval').getAllKeys()
                keys.onsuccess = () => {
                  db.close()
                  resolve(keys.result.filter((k) => String(k).startsWith('weld-plan:')).length)
                }
                keys.onerror = () => {
                  db.close()
                  resolve(0)
                }
              }
            }),
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0)
}

async function saveAcceptedPlan(page: Page) {
  await page.goto('/')
  await loadSample(page, assembly)
  await page.getByRole('button', { name: 'Accept all above 0.70' }).click()
  await expect(statusBar(page)).toContainText(counts(SEAMS, 0))
  await waitForSavedPlan(page)
}

test('reopening the same part offers the saved plan and Restore brings it back', async ({ page }) => {
  await saveAcceptedPlan(page)
  await page.reload()
  await page.getByRole('button', { name: assembly.name, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Restore your saved plan?' })
  await expect(dialog).toContainText(`${SEAMS} accepted seams`)
  await dialog.getByRole('button', { name: 'Restore' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(statusBar(page)).toContainText(counts(SEAMS, 0))
})

test('Start fresh leaves the part untouched and keeps the saved plan for the next visit', async ({ page }) => {
  await saveAcceptedPlan(page)
  await page.reload()
  await page.getByRole('button', { name: assembly.name, exact: true }).click()
  await page.getByRole('dialog', { name: 'Restore your saved plan?' }).getByRole('button', { name: 'Start fresh' }).click()
  await expect(statusBar(page)).toContainText(counts(0, SEAMS))

  await page.reload()
  await page.getByRole('button', { name: assembly.name, exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Restore your saved plan?' })).toBeVisible()
})
