import { expect, loadSample, sampleById, test } from './helpers'

const NAMES = ['Import', 'Seams', 'Procedures', 'Access', 'Sequence', 'Export']

for (const width of [1280, 1440]) {
  test(`all six step names are shown and the top bar does not overflow at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await loadSample(page, sampleById('tank-with-manhole'))
    const nav = page.getByRole('navigation', { name: 'Workflow steps' })
    for (const name of NAMES) {
      const label = nav.getByText(name, { exact: true })
      await expect(label, name).toBeVisible()
      const box = (await label.boundingBox())!
      // A screen reader only label is clipped to one pixel.
      expect(box.width, name).toBeGreaterThan(20)
    }
    const widths = await page.evaluate(() => {
      const header = document.querySelector('header')!
      const list = document.querySelector('nav[aria-label="Workflow steps"] ol')!
      return {
        headerScroll: header.scrollWidth - header.clientWidth,
        listScroll: list.scrollWidth - list.clientWidth,
        exportRight: header.querySelector('button[aria-label="Keyboard shortcuts"]')!.getBoundingClientRect().right,
        viewport: window.innerWidth,
      }
    })
    expect(widths.headerScroll).toBeLessThanOrEqual(0)
    expect(widths.listScroll).toBeLessThanOrEqual(0)
    expect(widths.exportRight).toBeLessThanOrEqual(widths.viewport)
  })
}
