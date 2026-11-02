import { describe, expect, it } from 'vitest'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { parseStl } from '../../../src/core/mesh/parseStl'
import { buildBodyBvhs } from '../../../src/core/seams/bodyBvh'
import { DEFAULT_DETECT_SETTINGS, detectSeams, type SeamCandidate } from '../../../src/core/seams/detect'
import { loadSampleModel, loadSoup, transformSoup } from '../helpers/models'
import { readManifest, readSample } from '../helpers/samples'
import { cubeTriangles, soupOf } from '../helpers/shapes'

const detect = (id: string, creaseAngleDeg = DEFAULT_DETECT_SETTINGS.creaseAngleDeg) =>
  detectSeams(loadSampleModel(id), { creaseAngleDeg })

const countBy = (seams: SeamCandidate[], source: SeamCandidate['source']) => seams.filter((s) => s.source === source).length

describe('detectSeams against the hand-derived manifest', () => {
  it.each(readManifest().samples.map((s) => [s.id, s] as const))('%s yields the expected seams per source', (id, entry) => {
    const seams = detect(id)
    expect(countBy(seams, 'crease'), 'crease').toBe(entry.expectedCreaseSeams)
    expect(countBy(seams, 'contact'), 'contact').toBe(entry.expectedContactSeams)
    expect(countBy(seams, 'intersection'), 'intersection').toBe(entry.expectedIntersectionSeams)
    expect(seams, 'total').toHaveLength(entry.expectedCreaseSeams + entry.expectedContactSeams + entry.expectedIntersectionSeams)
  })
})

describe('contact seams', () => {
  const near = (a: number[], b: number[]) => a.every((x, i) => Math.abs(x - b[i]!) < 1e-6)

  it('gives the T-joint assembly the same two fillets as the merged T-joint', () => {
    const merged = detect('t-joint-merged')
    const assembly = detect('t-joint-assembly')
    expect(assembly).toHaveLength(2)
    for (const seam of assembly) {
      expect(seam.source).toBe('contact')
      expect(seam.jointType).toBe('fillet')
      expect(seam.id.startsWith('contact-')).toBe(true)
      expect(Math.abs(seam.lengthMm - 200)).toBeLessThan(0.5)
      expect(Math.abs(seam.openingAngleDeg - 90)).toBeLessThan(0.5)
      expect(seam.closed).toBe(false)
    }
    const side = (seam: SeamCandidate) => Math.sign(seam.points[0]!.p[1])
    for (const sign of [-1, 1]) {
      const a = assembly.find((s) => side(s) === sign)!
      const m = merged.find((s) => side(s) === sign)!
      expect(Math.abs(a.lengthMm - m.lengthMm)).toBeLessThan(0.5)
      expect(a.points[0]!.p[2]).toBeCloseTo(m.points[0]!.p[2], 3)
      for (const { n1, n2 } of a.points) {
        const pair = [n1, n2]
        expect(pair.some((n) => near(n, [0, sign, 0]))).toBe(true)
        expect(pair.some((n) => near(n, [0, 0, 1]))).toBe(true)
      }
    }
  })

  it('gives the double-bottom cell its 50 contact seams by length', () => {
    const seams = detect('double-bottom-cell')
    const contact = seams.filter((s) => s.source === 'contact')
    const expected: Array<[number, number]> = [[800, 8], [150, 12], [100, 6], [44, 6], [48, 6], [40, 12]]
    for (const [lengthMm, count] of expected) {
      expect(contact.filter((s) => Math.abs(s.lengthMm - lengthMm) < 0.5).length, `${lengthMm} mm`).toBe(count)
    }
    expect(contact).toHaveLength(50)
    const crease = seams.filter((s) => s.source === 'crease')
    expect(crease).toHaveLength(6)
    for (const seam of crease) expect(Math.abs(seam.lengthMm - 150)).toBeLessThan(0.5)
  })

  it('uses the supplied body BVHs instead of building its own', () => {
    const model = loadSampleModel('t-joint-assembly')
    const bvhs = buildBodyBvhs(model)
    const seams = detectSeams(model, { creaseAngleDeg: 30 }, { bodyBvhs: bvhs })
    expect(seams).toHaveLength(2)
  })

  it('leaves single body samples with the same ids as before', () => {
    expect(detect('t-joint-merged').map((s) => s.id)).toEqual(detect('t-joint-ascii').map((s) => s.id))
    for (const seam of detect('box-beam')) expect(seam.id.startsWith('crease-')).toBe(true)
  })
})

describe('intersection seams', () => {
  const loops = detect('bar-through-plate')

  it('gives the bar through the plate one closed loop on each plate face', () => {
    expect(loops).toHaveLength(2)
    for (const seam of loops) {
      expect(seam.source).toBe('intersection')
      expect(seam.jointType).toBe('fillet')
      expect(seam.closed).toBe(true)
      expect(seam.id.startsWith('intersection-')).toBe(true)
      expect(Math.abs(seam.lengthMm / (2 * Math.PI * 25) - 1)).toBeLessThan(0.01)
      expect(Math.abs(seam.openingAngleDeg - 90)).toBeLessThan(0.5)
    }
    expect(loops.map((s) => Math.round(s.points[0]!.p[2])).sort((a, b) => a - b)).toEqual([0, 10])
  })

  it('points the bisector up and outward on the top face and down and outward on the bottom face', () => {
    for (const seam of loops) {
      const top = seam.points[0]!.p[2] > 5
      for (const { p, n1, n2 } of seam.points) {
        const b = [n1[0] + n2[0], n1[1] + n2[1], n1[2] + n2[2]]
        const radial = Math.hypot(p[0], p[1])
        expect(b[0]! * (p[0] / radial) + b[1]! * (p[1] / radial)).toBeGreaterThan(0.5)
        expect(top ? b[2]! : -b[2]!).toBeGreaterThan(0.5)
      }
    }
  })

  it('finds no intersection seams where bodies only touch', () => {
    for (const id of ['t-joint-assembly', 'double-bottom-cell']) {
      expect(detect(id).filter((s) => s.source === 'intersection'), id).toHaveLength(0)
    }
  })
})

describe('winding repair', () => {
  it('finds the same two fillets in each flipped T-joint as in the merged one', () => {
    const merged = detect('t-joint-merged')
    const flipped = detect('flipped-normals')
    expect(flipped).toHaveLength(4)
    for (const seam of flipped) {
      expect(seam.source).toBe('crease')
      expect(seam.concavity).toBe('known')
      expect(Math.abs(seam.lengthMm - 200)).toBeLessThan(0.5)
      expect(Math.abs(seam.openingAngleDeg - 90)).toBeLessThan(0.5)
      expect(Math.abs(seam.confidence - merged[0]!.confidence)).toBeLessThan(1e-6)
    }
  })

  it('does not depend on the normals stored in the file', () => {
    const buffer = readSample('flipped-normals').slice(0)
    const view = new DataView(buffer)
    const count = view.getUint32(80, true)
    for (let t = 0; t < count; t++) for (let c = 0; c < 3; c++) view.setFloat32(84 + 50 * t + 4 * c, 0, true)
    const tampered = detectSeams(buildMeshModel(parseStl(buffer).positions, 1), DEFAULT_DETECT_SETTINGS)
    expect(tampered.map((s) => s.id)).toEqual(detect('flipped-normals').map((s) => s.id))
  })

  it('marks seams of an open sheet as concavity unknown and still offers them', () => {
    const quad = (a: number[], b: number[], c: number[], d: number[]) => [[...a, ...b, ...c], [...a, ...c, ...d]]
    const sheet = soupOf([
      ...quad([0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0]),
      ...quad([0, 40, 0], [40, 40, 0], [40, 40, 40], [0, 40, 40]),
    ])
    const seams = detectSeams(buildMeshModel(sheet, 1), DEFAULT_DETECT_SETTINGS)
    expect(seams).toHaveLength(1)
    expect(seams[0]!.concavity).toBe('unknown')
    expect(seams[0]!.jointType).toBe('fillet')
    expect(seams[0]!.lengthMm).toBeCloseTo(40, 1)
  })

  it('reads concavity as known on every sample', () => {
    for (const { id } of readManifest().samples) expect(detect(id).every((s) => s.concavity === 'known'), id).toBe(true)
  })
})

describe('detectSeams on single samples', () => {
  it('gives the T-joint two 200 mm fillets at 90 degrees, labelled by length', () => {
    const seams = detect('t-joint-merged')
    expect(seams.map((s) => s.label)).toEqual(['S1', 'S2'])
    for (const seam of seams) {
      expect(seam.source).toBe('crease')
      expect(seam.jointType).toBe('fillet')
      expect(seam.closed).toBe(false)
      expect(seam.lengthMm).toBeCloseTo(200, 0)
      expect(Math.abs(seam.lengthMm - 200)).toBeLessThan(0.5)
      expect(Math.abs(seam.openingAngleDeg - 90)).toBeLessThan(1)
      expect(seam.confidence).toBeGreaterThan(0.95)
      expect(seam.points[0]!.s).toBe(0)
    }
  })

  it('gives the box girder 8 open seams of 600 mm at 90 degrees', () => {
    const seams = detect('box-beam')
    expect(seams).toHaveLength(8)
    for (const seam of seams) {
      expect(seam.closed).toBe(false)
      expect(Math.abs(seam.lengthMm - 600)).toBeLessThan(0.5)
      expect(Math.abs(seam.openingAngleDeg - 90)).toBeLessThan(1)
    }
  })

  it('gives the pipe an outer and a bore loop within 1% of 2 pi r', () => {
    const [outer, bore] = detect('pipe-on-plate')
    expect(outer!.closed).toBe(true)
    expect(bore!.closed).toBe(true)
    expect(Math.abs(outer!.lengthMm / (2 * Math.PI * 25) - 1)).toBeLessThan(0.01)
    expect(Math.abs(bore!.lengthMm / (2 * Math.PI * 19) - 1)).toBeLessThan(0.01)
    for (const seam of [outer!, bore!]) expect(Math.abs(seam.openingAngleDeg - 90)).toBeLessThan(1)
  })

  it('keeps the gusseted bracket at 16 seams across the whole slider range', () => {
    for (const angle of [15, 30, 60]) expect(detect('l-bracket-gussets', angle)).toHaveLength(16)
    const lengths = detect('l-bracket-gussets').map((s) => Math.round(s.lengthMm))
    expect(lengths).toEqual([...Array(12).fill(50), 28, 28, 20, 20])
  })

  it('drops seams shorter than 10 mm', () => {
    const tiny = buildMeshModel(transformSoup(loadSoup('t-joint-merged'), { scale: 0.04 }), 1)
    expect(detectSeams(tiny, DEFAULT_DETECT_SETTINGS)).toHaveLength(0)
  })

  it('finds nothing on convex bodies that do not touch', () => {
    const apart = buildMeshModel(soupOf([...cubeTriangles([0, 0, 0], [50, 50, 50]), ...cubeTriangles([0, 0, 80], [50, 50, 50])]), 1)
    expect(detectSeams(apart, DEFAULT_DETECT_SETTINGS)).toEqual([])
  })
})

describe('detectSeams ids', () => {
  it('are unique, prefixed and identical across runs', () => {
    const first = detect('l-bracket-gussets').map((s) => s.id)
    expect(new Set(first).size).toBe(first.length)
    expect(first.every((id) => id.startsWith('crease-'))).toBe(true)
    expect(detect('l-bracket-gussets').map((s) => s.id)).toEqual(first)
  })

  it('survive a change of crease angle that does not change the seam', () => {
    expect(detect('t-joint-merged', 25).map((s) => s.id)).toEqual(detect('t-joint-merged', 30).map((s) => s.id))
  })
})

describe('detectSeams under transforms', () => {
  const soup = loadSoup('t-joint-merged')
  const reference = detectSeams(buildMeshModel(soup, 1), DEFAULT_DETECT_SETTINGS)

  it('still finds 2 seams on a part modelled in metres', () => {
    const metres = buildMeshModel(transformSoup(soup, { scale: 0.001 }), 1000)
    expect(detectSeams(metres, DEFAULT_DETECT_SETTINGS)).toHaveLength(2)
  })

  it('gives the same seams after a 37 degree turn about an arbitrary axis and a 100000 mm move', () => {
    const moved = transformSoup(soup, {
      rotate: { axis: [1, 2, 3], angleDeg: 37 },
      translate: [100000, 100000, 100000],
    })
    const seams = detectSeams(buildMeshModel(moved, 1), DEFAULT_DETECT_SETTINGS)
    expect(seams).toHaveLength(reference.length)
    seams.forEach((seam, i) => {
      expect(Math.abs(seam.lengthMm - reference[i]!.lengthMm)).toBeLessThan(0.1)
      expect(Math.abs(seam.openingAngleDeg - 90)).toBeLessThan(1)
    })
  })
})
