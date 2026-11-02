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
