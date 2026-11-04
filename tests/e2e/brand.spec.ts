import { mkdirSync } from 'node:fs'
import { STEPS } from '../../src/state/store'
import { expect, loadSample, sampleById, test } from './helpers'
import { colourShare } from './pixels'

// Revolution Green (non-text and fill) and Bright Discovery: the highlight colours the 10 percent budget counts. Sand and
// Dark Forest are the pack's neutrals and do not count.
const BRAND = ['#628047', '#455B32', '#E97F01']
const TOLERANCE = 12
const BUDGET = 0.1

test.setTimeout(180_000)

for (const id of ['double-bottom-cell', 'tank-with-manhole']) {
  test(`${id}: every step is photographed and brand colour stays under ten percent of the screen`, async ({ page }) => {
    mkdirSync('test-results/brand', { recursive: true })
    await page.goto('/')
    await loadSample(page, sampleById(id))
    await page.getByRole('slider', { name: 'Confidence threshold' }).fill('0')
    await page.getByRole('button', { name: 'Accept all above 0.00' }).click()

    const shares: string[] = []
    for (const [index, step] of STEPS.entries()) {
      await page.getByRole('navigation', { name: 'Workflow steps' }).getByRole('button', { name: step.label }).click()
      await page.waitForTimeout(600)
      const png = await page.screenshot({ path: `test-results/brand/${id}-${index + 1}-${step.id}.png` })
      const share = await colourShare(page, png, BRAND, TOLERANCE)
      shares.push(`${step.id} ${(share * 100).toFixed(2)}%`)
      expect(share, `${id} ${step.id}`).toBeLessThan(BUDGET)
    }
    console.log(`brand share ${id}: ${shares.join(', ')}`)
  })
}
