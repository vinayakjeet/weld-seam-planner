import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { THEME_KEY } from '../../src/ui/shell/theme'
import { domChecks, type DomReport } from './domChecks'

interface Sample {
  id: string
  name: string
  units: string
  expectedCreaseSeams: number
  expectedContactSeams: number
  expectedIntersectionSeams: number
}

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const OUT = process.env.AUDIT_OUT ?? join(ROOT, 'test-results/visual-audit')
const ONLY = process.env.AUDIT_ONLY?.split(',')
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/samples/manifest.json'), 'utf8')) as { samples: Sample[] }
const SAMPLES = manifest.samples.filter((s) => !ONLY || ONLY.includes(s.id))
const SIZES = (process.env.AUDIT_SIZES ?? '1280x800,1440x900,1920x1080').split(',').map((s) => {
  const [width, height] = s.split('x').map(Number)
  return { width: width!, height: height! }
})
const THEMES = (process.env.AUDIT_THEMES ?? 'dark,light').split(',')
const VIEWS = ['front', 'back', 'left', 'right', 'top', 'bottom']
const SPRAY = 'WPS-GMAW-SPRAY-FW6'
const TANK = 'tank-with-manhole'

const seamCount = (s: Sample) => s.expectedCreaseSeams + s.expectedContactSeams + s.expectedIntersectionSeams
const seamRows = (page: Page) => page.getByRole('table', { name: 'Seams' }).getByRole('row').filter({ has: page.getByRole('cell') })
const stepButton = (page: Page, name: string) => page.getByRole('navigation', { name: 'Workflow steps' }).getByRole('button', { name })

class Recorder {
  readonly reports: Record<string, DomReport | { error: string }> = {}
  readonly console: string[] = []
  private readonly page: Page
  private readonly dir: string
  constructor(page: Page, dir: string) {
    this.page = page
    this.dir = dir
    mkdirSync(dir, { recursive: true })
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') this.console.push(`${m.type()}: ${m.text()}`)
    })
    page.on('pageerror', (e) => this.console.push(`pageerror: ${e.message}`))
  }

  // The pointer rests on the status bar so no hover state or tooltip is in the picture.
  async shot(name: string, settleMs = 400) {
    const { width, height } = this.page.viewportSize()!
    await this.page.mouse.move(width - 3, height - 3)
    await this.page.evaluate(() => document.fonts.ready)
    await this.page.waitForTimeout(settleMs)
    await this.page.screenshot({ path: join(this.dir, `${name}.png`) })
    this.reports[name] = await this.page.evaluate(domChecks)
  }

  // The view cube sits in the top right corner of the canvas.
  async cube(name: string) {
    const box = (await this.page.locator('canvas').first().boundingBox())!
    await this.page.screenshot({ path: join(this.dir, `${name}.png`), clip: { x: box.x + box.width - 144, y: box.y, width: 144, height: 144 } })
  }

  // A stage that fails is written down and the run goes on, so one stuck step does not hide the rest.
  async stage(name: string, run: () => Promise<void>) {
    try {
      await run()
    } catch (error) {
      this.reports[`${name}-failed`] = { error: String(error).slice(0, 2000) }
      await this.page.screenshot({ path: join(this.dir, `${name}-failed.png`) }).catch(() => undefined)
      await this.page.keyboard.press('Escape').catch(() => undefined)
    }
  }

  save() {
    writeFileSync(join(this.dir, 'checks.json'), JSON.stringify({ console: this.console, reports: this.reports }, null, 1))
  }
}

async function openSample(page: Page, sample: Sample, onUnits?: () => Promise<void>) {
  await page.getByRole('button', { name: sample.name, exact: true }).click()
  if (sample.units !== 'mm') {
    const dialog = page.getByRole('dialog', { name: 'What units is this file in?' })
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    if (onUnits) await onUnits()
    await dialog.getByLabel('Inches (in)').check()
    await dialog.getByRole('button', { name: 'Load part' }).click()
  }
}

async function waitLoaded(page: Page, sample: Sample) {
  await expect(seamRows(page)).toHaveCount(seamCount(sample), { timeout: 60_000 })
  await expect(page.getByRole('progressbar')).toHaveCount(0, { timeout: 60_000 })
}

async function waitAccess(page: Page) {
  await expect(page.getByLabel('Checking torch access')).toHaveCount(0, { timeout: 60_000 })
}

// idb-keyval keeps the plan under weld-plan:<hash>; the save waits a second after the last change.
async function waitSaved(page: Page) {
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
                keys.onerror = () => resolve(0)
              }
            }),
        ),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0)
}

// With a part loaded, a drop on the Import step's box loads the file; a drop anywhere else only opens that step.
async function dropTextFile(page: Page) {
  await page.waitForSelector('[aria-label="Import a part"]')
  await page.evaluate(() => {
    const target = document.querySelector('[aria-label="Import a part"]')!
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File(['this is plain text, not an STL\n'], 'notes.txt', { type: 'text/plain' }))
    const init = { bubbles: true, cancelable: true, dataTransfer }
    target.dispatchEvent(new DragEvent('dragover', init))
    target.dispatchEvent(new DragEvent('drop', init))
  })
}

// Clicks the canvas until a port lands on the roof (direction 0, 0, -1), then moves it to the spec position. A click on a
// wall gives a sideways port, which would make the reach screens differ between window sizes.
async function placeTankPort(page: Page) {
  const box = (await page.locator('canvas').boundingBox())!
  const spots = [[0.5, 0.3], [0.45, 0.35], [0.55, 0.32], [0.5, 0.38], [0.45, 0.42], [0.4, 0.3], [0.6, 0.35], [0.5, 0.25]]
  const port = page.getByRole('listitem', { name: 'Port P1' })
  for (const [fx, fy] of spots) {
    await page.getByRole('button', { name: 'Add port' }).click()
    await page.mouse.click(box.x + box.width * fx!, box.y + box.height * fy!)
    if (!(await port.isVisible())) {
      await page.getByRole('button', { name: 'Cancel placing' }).click()
      continue
    }
    if ((await port.innerText()).includes('Direction 0, 0, -1')) break
    await port.getByRole('button', { name: 'Delete P1' }).click()
  }
  await expect(port).toContainText('Direction 0, 0, -1')
  await page.mouse.click(box.x + 4, box.y + box.height - 4)
  for (const [axis, value] of [['X', '400'], ['Y', '500'], ['Z', '1000']] as const) {
    const input = page.getByLabel(`P1 ${axis}`, { exact: true })
    await input.fill(value)
    await input.press('Enter')
  }
  await expect(page.getByLabel('P1 Z', { exact: true })).toHaveValue('1000')
}

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size })
    for (const theme of THEMES) {
      for (const sample of SAMPLES) {
        test(`${sample.id} ${theme} ${size.width}x${size.height}`, async ({ page }) => {
          const rec = new Recorder(page, join(OUT, `${size.width}x${size.height}`, theme, sample.id))
          await page.addInitScript(([key, value]) => window.localStorage.setItem(key!, value!), [THEME_KEY, theme])
          try {
            await page.goto('/')
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
            await expect(page.getByRole('button', { name: sample.name, exact: true })).toBeVisible({ timeout: 30_000 })
            await rec.shot('00-empty')
            // Every step before a part is loaded, so the empty states are photographed too.
            await rec.stage('00-empty-steps', async () => {
              for (const step of ['Seams', 'Procedures', 'Access', 'Sequence', 'Export']) {
                await stepButton(page, step).click()
                await rec.shot(`00-empty-${step.toLowerCase()}`)
              }
              await stepButton(page, 'Import').click()
            })

            await openSample(page, sample, () => rec.shot('01-units-dialog'))
            await waitLoaded(page, sample)
            await rec.shot('02a-seams-candidates', 800)
            // The steps that need accepted seams, before any is accepted.
            await rec.stage('02-none-accepted', async () => {
              for (const step of ['Procedures', 'Sequence', 'Export']) {
                await stepButton(page, step).click()
                await rec.shot(`02n-none-accepted-${step.toLowerCase()}`)
              }
              await stepButton(page, 'Seams').click()
            })

            await rec.stage('01-import', async () => {
              await stepButton(page, 'Import').click()
              await rec.shot('01-import-loaded')
              await stepButton(page, 'Seams').click()
            })

            await rec.stage('02-seams', async () => {
              await page.getByRole('slider', { name: 'Confidence threshold' }).fill('0')
              await page.getByRole('button', { name: 'Accept all above 0.00' }).click()
              await rec.shot('02b-seams-accepted')
            })

            await rec.stage('05a-sequence-no-procedure', async () => {
              await stepButton(page, 'Sequence').click()
              await rec.shot('05a-sequence-no-procedure', 800)
              await stepButton(page, 'Export').click()
              await rec.shot('06a-export-no-procedure', 800)
            })

            await rec.stage('03-procedures', async () => {
              await stepButton(page, 'Procedures').click()
              await rec.shot('03a-procedures-unassigned')
              const rows = seamRows(page)
              await rows.first().getByRole('cell').first().click()
              await rows.last().scrollIntoViewIfNeeded()
              await rows.last().getByRole('cell').first().click({ modifiers: ['Shift'] })
              await page.getByLabel('Welding procedure').selectOption({ value: SPRAY })
              await expect(page.getByRole('table', { name: 'Seams' }).getByRole('cell', { name: SPRAY }).first()).toBeVisible()
              await rec.shot('03b-procedures-assigned')
            })

            await rec.stage('04-access', async () => {
              await stepButton(page, 'Access').click()
              await waitAccess(page)
              await rec.shot('04a-access', 800)
              if (sample.id === TANK) {
                await placeTankPort(page)
                const run = page.getByRole('button', { name: /Run reach on \d+ snake seams/ })
                await expect(run).toBeEnabled({ timeout: 30_000 })
                await run.click()
                await expect(page.getByRole('progressbar', { name: 'Reach progress' })).toBeVisible()
                await rec.shot('04b-access-reach-running', 200)
                await expect(page.getByText(/Reach measured for \d+ seams/)).toBeVisible({ timeout: 180_000 })
                await rec.shot('04c-access-reach', 800)
              }
            })

            await rec.stage('05-sequence', async () => {
              await stepButton(page, 'Sequence').click()
              await page.getByRole('button', { name: 'Optimise', exact: true }).click()
              await expect(page.getByText('Current order: minimum air travel.', { exact: false })).toBeVisible({ timeout: 60_000 })
              await rec.shot('05b-sequence-optimised', 800)
              await page.getByRole('button', { name: 'X-ray' }).click()
              await rec.shot('05c-sequence-xray', 800)
              await page.getByRole('button', { name: 'X-ray' }).click()
            })

            await rec.stage('06-export', async () => {
              await stepButton(page, 'Export').click()
              await rec.shot('06b-export', 800)
              await page.getByRole('button', { name: 'More export options' }).click()
              await rec.shot('06c-export-menu')
              await page.keyboard.press('Escape')
            })

            await rec.stage('views', async () => {
              await stepButton(page, 'Seams').click()
              for (const [i, view] of VIEWS.entries()) {
                await page.keyboard.press(`Shift+Digit${i + 1}`)
                await rec.shot(`07-view-${i + 1}-${view}`, 900)
                await rec.cube(`07-cube-${i + 1}-${view}`)
              }
            })

            await rec.stage('08-shortcuts', async () => {
              await page.keyboard.press('Shift+Slash')
              await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
              await rec.shot('08-shortcuts')
              await page.keyboard.press('Escape')
            })

            await rec.stage('09-error', async () => {
              await stepButton(page, 'Import').click()
              await dropTextFile(page)
              await expect(page.getByRole('alert')).toBeVisible()
              await rec.shot('09-error-banner')
              await page.getByRole('alert').getByRole('button', { name: 'Dismiss' }).click()
            })

            await rec.stage('10-restore', async () => {
              await waitSaved(page)
              await page.reload()
              await openSample(page, sample)
              const dialog = page.getByRole('dialog', { name: 'Restore your saved plan?' })
              await expect(dialog).toBeVisible({ timeout: 60_000 })
              await rec.shot('10a-restore-dialog')
              await dialog.getByRole('button', { name: 'Restore' }).click()
              await expect(dialog).toHaveCount(0)
              await expect(page.getByRole('progressbar')).toHaveCount(0, { timeout: 60_000 })
              await rec.shot('10b-restored', 800)
            })
          } finally {
            rec.save()
          }
        })
      }
    }
  })
}
