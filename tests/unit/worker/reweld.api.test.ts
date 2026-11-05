import { describe, expect, it } from 'vitest'
import { DEFAULT_DETECT_SETTINGS } from '../../../src/core/seams/detect'
import { createGeometryApi, type LoadOutcome } from '../../../src/worker/geometry.api'
import { scaleToMm } from '../../../src/core/mesh/units'
import { loadSoup, transformSoup } from '../helpers/models'
import { perturbSoup } from '../helpers/noise'
import { readSample } from '../helpers/samples'
import { shown } from '../helpers/state'
import { makeBinaryStl } from '../helpers/stl'

function stlOf(soup: Float32Array): ArrayBuffer {
  const tris: number[][] = []
  for (let i = 0; i < soup.length; i += 9) tris.push(Array.from(soup.slice(i, i + 9)))
  return makeBinaryStl(tris, 'noisy')
}

const noisyPipe = (seed: number) => stlOf(perturbSoup(transformSoup(loadSoup('pipe-on-plate'), { scale: scaleToMm('mm') }), 0.02, seed))

function ready(outcome: LoadOutcome) {
  if (outcome.status !== 'ready') throw new Error(`expected ready, got ${outcome.status}`)
  return outcome
}

async function seamCount(api: ReturnType<typeof createGeometryApi>) {
  const outcome = await api.detect(DEFAULT_DETECT_SETTINGS, () => {})
  if (outcome.status !== 'ok') throw new Error('detect failed')
  return shown(outcome.seams).length
}

describe('geometry api: reweld', () => {
  it('says what to do when no part is loaded', async () => {
    const outcome = await createGeometryApi().reweld(5e-4, () => {})
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') for (const part of Object.values(outcome.error)) expect(part.trim().length).toBeGreaterThan(0)
  })

  it.each([1e-7, 2e-3, Number.NaN])('refuses a tolerance of %s, which is outside 1e-6 to 1e-3 of the diagonal', async (tolerance) => {
    const api = createGeometryApi()
    ready(await api.loadStl(readSample('t-joint-merged'), 't.stl', () => {}))
    const outcome = await api.reweld(tolerance, () => {})
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') expect(outcome.error.why).toMatch(/1e-6|0\.000001/)
  })

  it('welds the loaded file again at the new tolerance and keeps the part\'s identity', async () => {
    const api = createGeometryApi()
    const first = ready(await api.loadStl(noisyPipe(1), 'noisy.stl', () => {}))
    const again = ready(await api.reweld(5e-4, () => {}))
    expect(again.part.sha256).toBe(first.part.sha256)
    expect(again.part.name).toBe('noisy.stl')
    expect(again.display.positions.length).toBeGreaterThan(0)
  })

  it('turns the extra creases of a noisy part into the 2 expected seams', async () => {
    const counts: Array<[number, number]> = []
    for (const seed of [1, 2, 3, 4]) {
      const api = createGeometryApi()
      ready(await api.loadStl(noisyPipe(seed), 'noisy.stl', () => {}))
      const before = await seamCount(api)
      ready(await api.reweld(5e-4, () => {}))
      counts.push([before, await seamCount(api)])
    }
    expect(counts.map(([, after]) => after)).toEqual([2, 2, 2, 2])
    expect(counts.some(([before]) => before > 2)).toBe(true)
  })

  it('works after a unit answer, and a newly loaded file starts again at the default tolerance', async () => {
    const api = createGeometryApi()
    const asked = await api.loadStl(readSample('t-joint-inch'), 'inch.stl', () => {})
    if (asked.status === 'needs-units') ready(await api.setUnits('in', () => {}))
    const welded = ready(await api.reweld(1e-4, () => {}))
    expect(welded.part.sourceUnits).toBe('in')
    expect(welded.part.bbox.max[0] - welded.part.bbox.min[0]).toBeCloseTo(200, 0)

    ready(await api.loadStl(noisyPipe(1), 'noisy.stl', () => {}))
    const before = await seamCount(api)
    const fresh = createGeometryApi()
    ready(await fresh.loadStl(noisyPipe(1), 'noisy.stl', () => {}))
    expect(before).toBe(await seamCount(fresh))
  })
})
