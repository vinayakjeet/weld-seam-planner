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
  await page.getByRole('button', { name: /Validate and Export/ }).click()
  await expect(page.getByText('No errors. Export is ready.')).toBeVisible()
  const { json } = await downloadJson(page, () => page.getByRole('button', { name: 'Export', exact: true }).click())
  expect((json as { seams: unknown[] }).seams).toHaveLength(expectedSeams(cell))

  // data: and blob: URLs never leave the browser.
  const network = urls.filter((url) => !/^(data|blob):/.test(url))
  expect(network.length).toBeGreaterThan(0)
  const foreign = network.filter((url) => new URL(url).origin !== origin)
  expect(foreign, 'requests to another origin').toEqual([])

  expect(network.some((url) => url.endsWith('.woff2'))).toBe(true)
  expect(await page.evaluate(() => document.fonts.check('600 12px "JetBrains Mono"'))).toBe(true)
})
