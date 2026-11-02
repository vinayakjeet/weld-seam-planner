import { describe, expect, it } from 'vitest'
import { computeFaceData } from '../../../src/core/mesh/faces'
import { buildMeshModel, type MeshModel } from '../../../src/core/mesh/model'
import { extractCreaseEdges } from '../../../src/core/seams/crease'
import { loadSampleModel } from '../helpers/models'
import { soupOf } from '../helpers/shapes'

// Bare triangle pairs are open sheets, which buildMeshModel marks unsigned. The concavity rule is tested on them
// as if their winding were trusted; the unsigned path has its own tests below.
const signed = (model: MeshModel): MeshModel => ({ ...model, orientation: { ...model.orientation, unsignedBodies: [] } })

// Two triangles sharing the x axis edge from (0,0,0) to (10,0,0). One lies flat on z = 0,
// the other leaves it by alphaDeg: up (valley, concave) or down (ridge, convex).
function fold(alphaDeg: number, kind: 'valley' | 'ridge'): MeshModel {
  const a = (alphaDeg * Math.PI) / 180
  const sign = kind === 'valley' ? 1 : -1
  const apex = [5, -10 * Math.cos(a), sign * 10 * Math.sin(a)]
  return signed(buildMeshModel(soupOf([[0, 0, 0, 10, 0, 0, 5, 10, 0], [10, 0, 0, 0, 0, 0, ...apex]]), 1))
}

function creasesOf(model: MeshModel, angleDeg: number) {
  return extractCreaseEdges(model, computeFaceData(model.mesh), angleDeg)
}

function totalLength(model: MeshModel, edgeIds: Uint32Array): number {
  const p = model.mesh.positions
  let sum = 0
  for (const e of edgeIds) {
    const a = model.edges.edgeA[e]! * 3
    const b = model.edges.edgeB[e]! * 3
    sum += Math.hypot(p[a]! - p[b]!, p[a + 1]! - p[b + 1]!, p[a + 2]! - p[b + 2]!)
  }
  return sum
}

describe('extractCreaseEdges on small folds', () => {
  it('flags a 90 degree valley as a concave crease with theta 90', () => {
    const result = creasesOf(fold(90, 'valley'), 30)
    expect(result.edgeIds).toHaveLength(1)
    expect(result.dihedralDeg[0]).toBeCloseTo(90, 3)
  })

  it('does not return the mirrored ridge, which is convex', () => {
    expect(creasesOf(fold(90, 'ridge'), 30).edgeIds).toHaveLength(0)
  })

  it('ignores coplanar neighbours', () => {
    expect(creasesOf(fold(0, 'valley'), 15).edgeIds).toHaveLength(0)
  })

  it('applies the angle threshold: a 25 degree valley is out at 30 and in at 20', () => {
    const model = fold(25, 'valley')
    expect(creasesOf(model, 30).edgeIds).toHaveLength(0)
    expect(creasesOf(model, 20).edgeIds).toHaveLength(1)
  })

  it('never reports boundary edges, so a lone triangle has no creases', () => {
    const lone = buildMeshModel(soupOf([[0, 0, 0, 10, 0, 0, 0, 10, 0]]), 1)
    expect(creasesOf(lone, 15).edgeIds).toHaveLength(0)
  })

  it('skips a non-manifold edge even when its faces meet at 90 degrees', () => {
    const book = soupOf([
      [0, 0, 0, 10, 0, 0, 5, 10, 0],
      [0, 0, 0, 10, 0, 0, 5, -10, 0],
      [0, 0, 0, 10, 0, 0, 5, 0, 10],
    ])
    const model = buildMeshModel(book, 1)
    expect(model.edges.stats.nonManifold).toBe(1)
    expect(creasesOf(model, 15).edgeIds).toHaveLength(0)
  })
})

describe('extractCreaseEdges on unsigned bodies', () => {
  const unsignedFold = (kind: 'valley' | 'ridge') => {
    const a = (90 * Math.PI) / 180
    const sign = kind === 'valley' ? 1 : -1
    const apex = [5, -10 * Math.cos(a), sign * 10 * Math.sin(a)]
    return buildMeshModel(soupOf([[0, 0, 0, 10, 0, 0, 5, 10, 0], [10, 0, 0, 0, 0, 0, ...apex]]), 1)
  }

  it('returns both a valley and a ridge, each marked unknown, because the sign of an open sheet is not known', () => {
    for (const kind of ['valley', 'ridge'] as const) {
      const model = unsignedFold(kind)
      expect(model.orientation.unsignedBodies).toEqual([0])
      const result = creasesOf(model, 30)
      expect(result.edgeIds, kind).toHaveLength(1)
      expect(Array.from(result.unknown), kind).toEqual([1])
      expect(result.dihedralDeg[0], kind).toBeCloseTo(90, 3)
    }
  })

  it('marks every crease of a signed body as known', () => {
    const result = creasesOf(loadSampleModel('t-joint-merged'), 30)
    expect(result.edgeIds.length).toBeGreaterThan(0)
    expect(Array.from(result.unknown).every((u) => u === 0)).toBe(true)
  })
})

describe('extractCreaseEdges on the samples', () => {
  it('finds only 90 degree concave edges on the T-joint, 400 mm in total', () => {
    const model = loadSampleModel('t-joint-merged')
    const { edgeIds, dihedralDeg } = creasesOf(model, 30)
    expect(edgeIds.length).toBeGreaterThan(0)
    for (const theta of dihedralDeg) expect(theta).toBeCloseTo(90, 1)
    expect(totalLength(model, edgeIds)).toBeCloseTo(400, 1)
  })

  it('finds 8 girder lines of 600 mm', () => {
    const model = loadSampleModel('box-beam')
    expect(totalLength(model, creasesOf(model, 30).edgeIds)).toBeCloseTo(4800, 1)
  })

  it('counts the 45 degree gusset toes only below 45 degrees', () => {
    const model = loadSampleModel('l-bracket-gussets')
    expect(totalLength(model, creasesOf(model, 44).edgeIds)).toBeCloseTo(744, 1)
    expect(totalLength(model, creasesOf(model, 46).edgeIds)).toBeCloseTo(696, 1)
  })

  it('finds the outer and the bore loop of the pipe and no facet creases', () => {
    const model = loadSampleModel('pipe-on-plate')
    expect(totalLength(model, creasesOf(model, 15).edgeIds)).toBeCloseTo(2 * Math.PI * 44, 0)
  })

  it('finds nothing on two separate convex boxes', () => {
    expect(creasesOf(loadSampleModel('t-joint-assembly'), 15).edgeIds).toHaveLength(0)
  })
})
