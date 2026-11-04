import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test as base, type Page } from '@playwright/test'

export interface SampleEntry {
  id: string
  name: string
  expectedCreaseSeams: number
  expectedContactSeams: number
  expectedIntersectionSeams: number
}

const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/samples/manifest.json', import.meta.url)), 'utf8')) as {
  samples: SampleEntry[]
}

export function sampleById(id: string): SampleEntry {
  const found = manifest.samples.find((sample) => sample.id === id)
  if (!found) throw new Error(`public/samples/manifest.json has no ${id} entry; regenerate it with npx tsx scripts/generate-samples.ts`)
  return found
}

// Seams the table lists with default settings: corner candidates are hidden, so only these three kinds count.
export const expectedSeams = (sample: SampleEntry) => sample.expectedCreaseSeams + sample.expectedContactSeams + sample.expectedIntersectionSeams

// Every test also fails if the app wrote to the console as an error.
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      page.on('pageerror', (error) => errors.push(error.message))
      await use(errors)
      expect(errors, 'the app logged console errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

export const seamRows = (page: Page) => page.getByRole('table', { name: 'Seams' }).getByRole('row').filter({ has: page.getByRole('cell') })
export const statusBar = (page: Page) => page.locator('footer')
export const counts = (accepted: number, candidates: number) => new RegExp(`Seams accepted / candidate\\s*${accepted} / ${candidates}`)

export async function loadSample(page: Page, sample: SampleEntry) {
  await page.getByRole('button', { name: sample.name, exact: true }).click()
  await expect(seamRows(page)).toHaveCount(expectedSeams(sample), { timeout: 30_000 })
  await expect(page.getByRole('progressbar')).toHaveCount(0)
}

// Click the first row, then Shift click the last: every seam in the table is selected.
export async function selectAllRows(page: Page) {
  const rows = seamRows(page)
  await rows.first().getByRole('cell').first().click()
  await rows.last().scrollIntoViewIfNeeded()
  await rows.last().getByRole('cell').first().click({ modifiers: ['Shift'] })
}

// Runs the action that starts a download and returns the suggested file name and the parsed JSON.
export async function downloadJson(page: Page, action: () => Promise<void>): Promise<{ name: string; json: unknown }> {
  const [download] = await Promise.all([page.waitForEvent('download'), action()])
  const path = await download.path()
  return { name: download.suggestedFilename(), json: JSON.parse(readFileSync(path, 'utf8')) as unknown }
}

export async function field(page: Page, name: string, value: string) {
  const input = page.getByLabel(name, { exact: true })
  await input.fill(value)
  await input.press('Enter')
}

// A full run shows the progress bar for several seconds; a run on one seam can finish before the bar is seen, so it
// waits for the completion message instead. The defaults are the full run on tank-with-manhole (20 snake seams).
export async function runReach(page: Page, label = /Run reach on 20 snake seams/, done = /Reach measured for 20 seams/) {
  const run = page.getByRole('button', { name: label })
  await expect(run).toBeEnabled({ timeout: 30_000 })
  await run.click()
  if (label.source.includes('snake seams')) await expect(page.getByRole('progressbar', { name: 'Reach progress' })).toBeVisible()
  await expect(page.getByText(done)).toBeVisible({ timeout: 120_000 })
  await expect(page.getByRole('progressbar', { name: 'Reach progress' })).toHaveCount(0)
}

// Presses Add port and clicks the canvas until a click lands on the part; any roof or floor hit gives a downward port.
export async function placePort(page: Page) {
  await page.getByRole('button', { name: 'Add port' }).click()
  const box = (await page.locator('canvas').boundingBox())!
  const spots = [[0.45, 0.42], [0.5, 0.35], [0.4, 0.5], [0.55, 0.5], [0.5, 0.6], [0.35, 0.4], [0.6, 0.4]]
  for (const [fx, fy] of spots) {
    await page.mouse.click(box.x + box.width * fx!, box.y + box.height * fy!)
    if (await page.getByRole('listitem', { name: 'Port P1' }).isVisible()) {
      // The click that places a port no longer touches the selection; a click on the empty corner clears it, so Run reach
      // covers every snake seam and not only the rows that were selected before.
      await page.mouse.click(box.x + 4, box.y + box.height - 4)
      return
    }
  }
  throw new Error('No click landed on the part, so no port was placed.')
}
