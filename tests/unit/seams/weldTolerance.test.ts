import { describe, expect, it } from 'vitest'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { scaleToMm } from '../../../src/core/mesh/units'
import { DEFAULT_DETECT_SETTINGS, detectSeams } from '../../../src/core/seams/detect'
import { loadSoup, transformSoup } from '../helpers/models'
import { readManifest } from '../helpers/samples'
import { perturbSoup } from '../helpers/noise'
import { shown } from '../helpers/state'

const entry = readManifest().samples.find((s) => s.id === 'pipe-on-plate')!
const expected = entry.expectedCreaseSeams + entry.expectedContactSeams + entry.expectedIntersectionSeams
const clean = transformSoup(loadSoup(entry.id), { scale: scaleToMm(entry.units) })
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]

const seamCount = (soup: Float32Array, weldTolerance?: number) => shown(detectSeams(buildMeshModel(soup, 1, undefined, weldTolerance), DEFAULT_DETECT_SETTINGS)).length

describe('weld tolerance against vertex noise on pipe-on-plate', () => {
  it('expects the 2 seams where the pipe meets the plate', () => {
    expect(expected).toBe(2)
    expect(seamCount(clean)).toBe(2)
  })

  it('gains short low-confidence creases at the default tolerance when every vertex moves by up to 0.02 mm', () => {
    const counts = SEEDS.map((seed) => seamCount(perturbSoup(clean, 0.02, seed)))
    expect(counts.some((n) => n > expected)).toBe(true)
  })

  it('gives exactly the 2 seams with a tolerance of 5e-4 of the diagonal, for every seed', () => {
    for (const seed of SEEDS) expect(seamCount(perturbSoup(clean, 0.02, seed), 5e-4), `seed ${seed}`).toBe(expected)
  })

  it('leaves the clean part at 2 seams with that tolerance', () => {
    expect(seamCount(clean, 5e-4)).toBe(expected)
  })
})
