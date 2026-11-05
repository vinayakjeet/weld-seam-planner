import { describe, expect, it } from 'vitest'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { scaleToMm } from '../../../src/core/mesh/units'
import { DEFAULT_DETECT_SETTINGS, detectSeams, type SeamCandidate } from '../../../src/core/seams/detect'
import { seamCentre } from '../../../src/core/seams/seamId'
import { perturbSoup, shuffleSoup } from '../helpers/noise'
import { loadSoup, transformSoup } from '../helpers/models'
import { readManifest } from '../helpers/samples'

const NOISE_MM = 0.02
// Far enough that float32 holds a vertex to about 0.004 mm only, which the ids must also stand.
const FAR: [number, number, number] = [32768, -40000, 50000]

interface Run {
  seams: SeamCandidate[]
  // The seam centres measured from the part's own box corner, so two placements of one part compare.
  centres: number[][]
}

function detect(soupMm: Float32Array): Run {
  const model = buildMeshModel(soupMm, 1)
  const seams = detectSeams(model, DEFAULT_DETECT_SETTINGS)
  const centres = seams.map((s) => seamCentre(s.points, s.closed).map((x, c) => x - model.bounds.min[c]!))
  return { seams, centres }
}

// The seam of `run` that is the same weld as `seam`: same kind, centre and length within 2 mm.
function counterpart(base: Run, k: number, run: Run): SeamCandidate | undefined {
  const seam = base.seams[k]!
  const matches = run.seams.filter((other, j) => {
    const d = Math.hypot(...base.centres[k]!.map((x, c) => x - run.centres[j]![c]!))
    return other.source === seam.source && other.closed === seam.closed && d < 2 && Math.abs(other.lengthMm - seam.lengthMm) < 2
  })
  return matches.length === 1 ? matches[0] : undefined
}

const samples = readManifest().samples

describe.each(samples.map((s) => [s.id, s] as const))('seam ids of %s', (id, entry) => {
  const mm = transformSoup(loadSoup(id), { scale: scaleToMm(entry.units) })
  const base = detect(mm)

  it('does not change when the part is moved far from its origin', () => {
    const far = detect(transformSoup(mm, { translate: FAR }))
    expect(far.seams.map((s) => s.id).sort()).toEqual(base.seams.map((s) => s.id).sort())
  })

  it('does not change when the triangles come in another order, which starts every chain and loop elsewhere', () => {
    for (const seed of [1, 2, 3]) {
      const shuffled = detect(shuffleSoup(mm, seed))
      expect(shuffled.seams.map((s) => s.id).sort(), `seed ${seed}`).toEqual(base.seams.map((s) => s.id).sort())
    }
  })

  it('does not change under 0.02 mm of noise on every vertex, with the start of every loop and the placement moved too', () => {
    for (const seed of [1, 2, 3]) {
      const moved = detect(transformSoup(shuffleSoup(perturbSoup(mm, NOISE_MM, seed), seed), { translate: FAR }))
      base.seams.forEach((seam, k) => {
        const same = counterpart(base, k, moved)
        // A seam the noise made vanish is not an id that changed; the next test counts them.
        if (same) expect(same.id, `${seam.label} ${seam.source} ${seam.lengthMm.toFixed(1)} mm, seed ${seed}`).toBe(seam.id)
      })
    }
  })
})

describe('seams the 0.02 mm noise adds or removes', () => {
  // Detection, not the id: on the slivers around a hole, a vertex moved by 0.02 mm tilts a face by more than the
  // crease angle, so a short low confidence crease appears, and a corner whose probe rays graze an edge can drop out.
  it('are few: the ids above are compared on every seam that is found again', () => {
    let total = 0
    let found = 0
    for (const entry of samples) {
      const mm = transformSoup(loadSoup(entry.id), { scale: scaleToMm(entry.units) })
      const base = detect(mm)
      for (const seed of [1, 2, 3]) {
        const noisy = detect(perturbSoup(mm, NOISE_MM, seed))
        base.seams.forEach((_, k) => {
          total++
          if (counterpart(base, k, noisy)) found++
        })
      }
    }
    expect(found / total).toBeGreaterThan(0.97)
  })
})
