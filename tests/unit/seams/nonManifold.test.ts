import { describe, expect, it } from 'vitest'
import { buildMeshModel, type MeshModel } from '../../../src/core/mesh/model'
import { DEFAULT_DETECT_SETTINGS, detectSeams } from '../../../src/core/seams/detect'
import { extractNonManifoldWedges } from '../../../src/core/seams/nonManifold'
import { loadSampleModel } from '../helpers/models'
import { fusedSolidT, soupOf } from '../helpers/shapes'

// Quads of length 100 hinged on the x axis, one per direction in the y z plane; angle 0 points along plus y.
function pages(anglesDeg: number[]): MeshModel {
  const tris = anglesDeg.flatMap((deg) => {
    const [y, z] = [Math.cos((deg * Math.PI) / 180) * 50, Math.sin((deg * Math.PI) / 180) * 50]
    return [[0, 0, 0, 100, 0, 0, 100, y, z], [0, 0, 0, 100, y, z, 0, y, z]]
  })
  return buildMeshModel(soupOf(tris), 1)
}

const wedgesOf = (model: MeshModel, angle = 30) => extractNonManifoldWedges(model, angle)
const near = (v: number[], w: number[]) => v.every((x, i) => Math.abs(x - w[i]!) < 1e-6)

describe('extractNonManifoldWedges', () => {
  // Plate left, plate right and a web: 180, 90 and 90 degree wedges.
  const fusedT = () => pages([180, 0, 90])

  it('turns a fused T into two 90 degree wedges and skips the 180 degree one', () => {
    const wedges = wedgesOf(fusedT())
    expect(wedges).toHaveLength(2)
    expect(wedges.map((w) => w.rank).sort()).toEqual([0, 1])
    for (const w of wedges) expect(w.openingDeg).toBeCloseTo(90, 3)
  })

  it('points the wedge normals into the free space beside each side of the web', () => {
    const wedges = wedgesOf(fusedT())
    const sides = wedges.map((w) => [w.n1, w.n2])
    // Right of the web the free space is bounded by the plate (normal plus z) and the web (normal plus y); left of it by minus y.
    expect(sides.some(([a, b]) => (near(a!, [0, 1, 0]) && near(b!, [0, 0, 1])) || (near(a!, [0, 0, 1]) && near(b!, [0, 1, 0])))).toBe(true)
    expect(sides.some(([a, b]) => (near(a!, [0, -1, 0]) && near(b!, [0, 0, 1])) || (near(a!, [0, 0, 1]) && near(b!, [0, -1, 0])))).toBe(true)
  })

  it('honours the crease slider: 90 degree wedges drop out above a 90 degree crease angle', () => {
    expect(wedgesOf(fusedT(), 60)).toHaveLength(2)
    expect(wedgesOf(fusedT(), 100)).toHaveLength(0)
  })

  it('drops wedges narrower than 45 degrees and wider than 135 degrees', () => {
    expect(wedgesOf(pages([0, 20, 180]))).toHaveLength(0)
    expect(wedgesOf(pages([0, 150, 200]))).toHaveLength(1)
  })

  it('gives a four page book four 90 degree wedges with ranks 0 to 3', () => {
    const wedges = wedgesOf(pages([0, 90, 180, 270]))
    expect(wedges.map((w) => w.rank).sort()).toEqual([0, 1, 2, 3])
  })

  it('returns nothing for a manifold fold and for every sample', () => {
    expect(wedgesOf(pages([0, 90]))).toHaveLength(0)
    for (const id of ['t-joint-merged', 'box-beam', 'double-bottom-cell']) expect(wedgesOf(loadSampleModel(id)), id).toHaveLength(0)
  })
})

describe('detectSeams with non-manifold edges', () => {
  it('offers the fused T as two coincident 100 mm fillets, one per side', () => {
    const seams = detectSeams(pages([180, 0, 90]), DEFAULT_DETECT_SETTINGS)
    expect(seams).toHaveLength(2)
    for (const seam of seams) {
      expect(seam.source).toBe('nonmanifold')
      expect(seam.jointType).toBe('fillet')
      expect(seam.closed).toBe(false)
      expect(seam.lengthMm).toBeCloseTo(100, 2)
      expect(seam.openingAngleDeg).toBeCloseTo(90, 2)
      expect(seam.id.startsWith('nonmanifold-')).toBe(true)
    }
    expect(new Set(seams.map((s) => s.id)).size).toBe(2)
  })

  it('keeps the plate normals of a wedge seam perpendicular to its tangent and ordered along it', () => {
    for (const seam of detectSeams(pages([180, 0, 90]), DEFAULT_DETECT_SETTINGS)) {
      for (const { t, n1, n2 } of seam.points) {
        expect(Math.abs(t[0])).toBeCloseTo(1, 6)
        const cross = [n1[1] * n2[2] - n1[2] * n2[1], n1[2] * n2[0] - n1[0] * n2[2], n1[0] * n2[1] - n1[1] * n2[0]]
        expect(cross[0]! * t[0] + cross[1]! * t[1] + cross[2]! * t[2]).toBeGreaterThan(0)
      }
    }
  })

  it('never offers boundary edges: an open fold gives only its crease', () => {
    const seams = detectSeams(pages([0, 90]), DEFAULT_DETECT_SETTINGS)
    expect(seams.every((s) => s.source === 'crease')).toBe(true)
  })

  // Around a foot edge of the fused solids the four faces leave a 90 degree wedge of free space beside the web and a
  // 90 degree wedge inside the web; at the ends of the foot both 90 degree wedges are inside the plate or the web.
  it('offers only the wedges of free space when the fused body is closed solids', () => {
    const model = buildMeshModel(soupOf(fusedSolidT()), 1)
    expect(model.bodies.count).toBe(1)
    expect(model.edges.stats.boundary).toBe(0)
    const seams = detectSeams(model, DEFAULT_DETECT_SETTINGS).filter((s) => s.source === 'nonmanifold')
    expect(seams).toHaveLength(2)
    for (const seam of seams) {
      expect(seam.lengthMm).toBeCloseTo(100, 2)
      expect(seam.openingAngleDeg).toBeCloseTo(90, 2)
      for (const { p, n1, n2 } of seam.points) {
        const side = Math.sign(p[1])
        expect(Math.abs(p[1])).toBeCloseTo(5, 4)
        expect(p[2]).toBeCloseTo(10, 4)
        // The bisector leans up and away from the web, into the free space.
        expect(n1[2] + n2[2]).toBeGreaterThan(0.5)
        expect(side * (n1[1] + n2[1])).toBeGreaterThan(0.5)
      }
    }
  })

  it('still offers every wedge of an open sheet, which has no inside', () => {
    expect(detectSeams(pages([180, 0, 90]), DEFAULT_DETECT_SETTINGS).filter((s) => s.source === 'nonmanifold')).toHaveLength(2)
  })

  it('finds no non-manifold seams in any sample', () => {
    for (const id of ['t-joint-merged', 't-joint-assembly', 'l-bracket-gussets', 'pipe-on-plate', 'bar-through-plate', 'flipped-normals']) {
      const seams = detectSeams(loadSampleModel(id), DEFAULT_DETECT_SETTINGS)
      expect(seams.filter((s) => s.source === 'nonmanifold'), id).toHaveLength(0)
    }
  })
})
