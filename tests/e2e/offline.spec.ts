import { downloadJson, expect, expectedSeams, loadSample, sampleById, selectAllRows, test } from './helpers'

const cell = sampleById('t-joint-merged')

test('loading a sample and exporting makes requests to the app origin only, and the self-hosted font loads', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const urls: string[] = []
  page.on('request', (request) => urls.push(request.url()))

  await page.goto('/')
  await loadSample(page, cell)
  await page.getByRole('button', { name: 'Accept all above 0.70' }).click()
  await page.getByRole('button', { name: /Procedures/ }).click()
  await selectAllRows(page)
  await page.getByLabel('Welding procedure').selectOption({ value: 'WPS-GMAW-SPRAY-FW6' })
  await page.getByRole('navigation', { name: 'Workflow steps' }).getByRole('button', { name: /Export/ }).click()
  await expect(page.getByText('No errors. Export is ready.')).toBeVisible()
  const { json } = await downloadJson(page, () => page.getByRole('button', { name: 'Export', exact: true }).click())
  expect((json as { seams: unknown[] }).seams).toHaveLength(expectedSeams(cell))

  // data: and blob: URLs never leave the browser.
  const network = urls.filter((url) => !/^(data|blob):/.test(url))
  expect(network.length).toBeGreaterThan(0)
  const foreign = network.filter((url) => new URL(url).origin !== origin)
  expect(foreign, 'requests to another origin').toEqual([])

  expect(network.some((url) => url.endsWith('.woff2'))).toBe(true)
  expect(await page.evaluate(() => document.fonts.check('600 12px "Onest"'))).toBe(true)
  expect(await page.evaluate(() => document.fonts.check('16px "Redaction"'))).toBe(true)

  // Tabular figures: a row of ones is as wide as a row of eights.
  const widths = await page.evaluate(() => {
    const widthOf = (text: string) => {
      const span = document.createElement('span')
      span.className = 'num'
      span.textContent = text
      document.body.append(span)
      const width = span.getBoundingClientRect().width
      span.remove()
      return width
    }
    return [widthOf('1111'), widthOf('8888')]
  })
  expect(widths[0]).toBeGreaterThan(0)
  expect(widths[0]).toBeCloseTo(widths[1]!, 1)
})
