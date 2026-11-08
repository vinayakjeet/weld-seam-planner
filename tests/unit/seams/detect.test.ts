import { describe, expect, it } from 'vitest'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { parseStl } from '../../../src/core/mesh/parseStl'
import { buildBodyBvhs } from '../../../src/core/seams/bodyBvh'
import { angleBetweenQuat } from '../../../src/core/math/quat'
import { DEFAULT_TORCH, torchPoses } from '../../../src/core/torch/frames'
import { DEFAULT_DETECT_SETTINGS, detectSeams, dropDuplicateSeams, type SeamCandidate } from '../../../src/core/seams/detect'
import { loadSampleModel, loadSoup, transformSoup } from '../helpers/models'
import { readManifest, readSample } from '../helpers/samples'
import { boxTube, cubeTriangles, extrude, mergedL, narrowFlangeT, soupOf, steppedLap } from '../helpers/shapes'
import { shown } from '../helpers/state'

// Corner candidates are detected but hidden, so everything below counts the visible seams unless it says "all".
const detectAll = (id: string, creaseAngleDeg = DEFAULT_DETECT_SETTINGS.creaseAngleDeg) =>
  detectSeams(loadSampleModel(id), { creaseAngleDeg })
const detect = (id: string, creaseAngleDeg = DEFAULT_DETECT_SETTINGS.creaseAngleDeg) => shown(detectAll(id, creaseAngleDeg))

const countBy = (seams: SeamCandidate[], source: SeamCandidate['source']) => seams.filter((s) => s.source === source).length

describe('detectSeams against the hand-derived manifest', () => {
  it.each(readManifest().samples.map((s) => [s.id, s] as const))('%s yields the expected seams per source', (id, entry) => {
    const seams = detect(id)
    expect(countBy(seams, 'crease'), 'crease').toBe(entry.expectedCreaseSeams)
    expect(countBy(seams, 'contact'), 'contact').toBe(entry.expectedContactSeams)
    expect(countBy(seams, 'intersection'), 'intersection').toBe(entry.expectedIntersectionSeams)
    expect(seams, 'total').toHaveLength(entry.expectedCreaseSeams + entry.expectedContactSeams + entry.expectedIntersectionSeams)
    expect(detectAll(id).filter((s) => s.hidden === 'hollow'), 'hollow').toHaveLength(entry.expectedHollowSeams)
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

  // Within the contact tolerance a web can float above the plate; the plate is measured from where the ray enters it.
  it('measures 10 and 10 on a web lifted 0.25 mm off the plate, not the gap', () => {
    const plate = cubeTriangles([-100, -60, 0], [200, 120, 10])
    const web = cubeTriangles([-100, -5, 10.25], [200, 10, 80])
    const seams = shown(detectSeams(buildMeshModel(soupOf([...plate, ...web]), 1), DEFAULT_DETECT_SETTINGS))
    expect(seams).toHaveLength(2)
    for (const seam of seams) expect(seam.thicknessMm, seam.label).toEqual([10, 10])
  })

  // On a large part the contact tolerance is wider than a tube wall, but a reading of a whole wall is never a gap.
  it('reads the 3.18 mm top wall of a box whose bore is a body of its own as 3.18 on a part 2.4 m across', () => {
    const floor = cubeTriangles([-1200, -100, -40], [2400, 200, 20])
    const box = cubeTriangles([-100, -30, 0], [200, 60, 25.4])
    const bore = cubeTriangles([-90, -26.82, 3.18], [180, 53.64, 19.04])
    const web = cubeTriangles([-50, -5, 25.4], [100, 10, 80])
    const seams = shown(detectSeams(buildMeshModel(soupOf([...floor, ...box, ...bore, ...web]), 1), DEFAULT_DETECT_SETTINGS))
    const feet = seams.filter((s) => s.source === 'contact' && Math.abs(s.lengthMm - 100) < 0.5)
    expect(feet).toHaveLength(2)
    for (const seam of feet) expect([...seam.thicknessMm].sort(), seam.label).toEqual([10, 3.18])
  })

  it('scores the contact seams of the T-joint assembly at least as high as the creases of the merged T-joint', () => {
    const lowest = (seams: SeamCandidate[]) => Math.min(...seams.map((s) => s.confidence))
    expect(lowest(detect('t-joint-assembly'))).toBeGreaterThanOrEqual(lowest(detect('t-joint-merged')))
  })

  it('scores every straight 90 degree contact seam of the double-bottom cell and the tank at 0.8 or more', () => {
    for (const id of ['double-bottom-cell', 'tank-with-manhole']) {
      for (const seam of detect(id).filter((s) => s.source === 'contact')) {
        expect(Math.abs(seam.openingAngleDeg - 90), seam.label).toBeLessThan(0.5)
        expect(seam.confidence, `${id} ${seam.label} ${seam.lengthMm.toFixed(1)} mm`).toBeGreaterThanOrEqual(0.8)
      }
    }
  })

  it('keeps one of two contact seams on the same line and side, and both of a line seen from opposite sides', () => {
    const [a, b] = detect('t-joint-assembly')
    const twin = { ...a!, id: `${a!.id}-twin`, lengthMm: a!.lengthMm - 0.01 }
    expect(dropDuplicateSeams([a!, twin, b!], 0.4).map((s) => s.id)).toEqual([a!.id, b!.id])
    expect(dropDuplicateSeams([twin, a!, b!], 0.4).map((s) => s.id)).toEqual([a!.id, b!.id])
    const facingAway = { ...twin, points: twin.points.map((p) => ({ ...p, n1: p.n1.map((v) => -v) as typeof p.n1, n2: p.n2.map((v) => -v) as typeof p.n2 })) }
    expect(dropDuplicateSeams([a!, facingAway], 0.4)).toHaveLength(2)
    const beside = { ...twin, points: twin.points.map((p) => ({ ...p, p: [p.p[0], p.p[1], p.p[2] + 1] as typeof p.p })) }
    expect(dropDuplicateSeams([a!, beside], 0.4)).toHaveLength(2)
  })

  it('uses the supplied body BVHs instead of building its own', () => {
    const model = loadSampleModel('t-joint-assembly')
    const bvhs = buildBodyBvhs(model)
    const seams = shown(detectSeams(model, { creaseAngleDeg: 30 }, { bodyBvhs: bvhs }))
    expect(seams).toHaveLength(2)
  })

  it('leaves single body samples with the same ids as before', () => {
    expect(detect('t-joint-merged').map((s) => s.id)).toEqual(detect('t-joint-ascii').map((s) => s.id))
    for (const seam of detect('box-beam')) expect(seam.id.startsWith('crease-')).toBe(true)
  })
})

describe('tank with manhole', () => {
  const seams = detect('tank-with-manhole')
  const lengths = (source: SeamCandidate['source']) =>
    seams.filter((s) => s.source === source).map((s) => s.lengthMm).sort((a, b) => a - b)
  const count = (source: SeamCandidate['source'], lengthMm: number, tolerance: number) =>
    seams.filter((s) => s.source === source && Math.abs(s.lengthMm - lengthMm) <= tolerance).length

  it('shows 21 seams: 12 crease and 9 contact', () => {
    expect(seams).toHaveLength(21)
    expect(countBy(seams, 'crease')).toBe(12)
    expect(countBy(seams, 'contact')).toBe(9)
    expect(countBy(seams, 'intersection')).toBe(0)
  })

  it('measures the crease lengths: 4 of 1584 mm and 8 of 984 mm', () => {
    expect(count('crease', 1584, 1)).toBe(4)
    expect(count('crease', 984, 1)).toBe(8)
    expect(lengths('crease')).toHaveLength(12)
  })

  // The coaming is a 64-gon; its loop follows the 308 mm circle the facets were cut from, not their chords (1934.4).
  it('measures the contact lengths: 4 of 864 mm, 4 of 272 mm and one closed loop of 2 pi 308 mm, all fillets', () => {
    expect(count('contact', 864, 2)).toBe(4)
    expect(count('contact', 272, 2)).toBe(4)
    const loops = seams.filter((s) => s.source === 'contact' && s.closed)
    expect(loops).toHaveLength(1)
    expect(Math.abs(loops[0]!.lengthMm - 2 * Math.PI * 308)).toBeLessThan(0.05)
    for (const seam of seams) expect(seam.jointType).toBe('fillet')
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
      expect(Math.abs(seam.lengthMm / (2 * Math.PI * 25) - 1)).toBeLessThan(2e-5)
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
    const tampered = shown(detectSeams(buildMeshModel(parseStl(buffer).positions, 1), DEFAULT_DETECT_SETTINGS))
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

  // Both loops are 96-gons, 0.018% short of the circle on their chords; the seams follow the circles.
  it('gives the pipe an outer and a bore loop within 0.002% of 2 pi r', () => {
    const [outer, bore] = detect('pipe-on-plate')
    expect(outer!.closed).toBe(true)
    expect(bore!.closed).toBe(true)
    expect(Math.abs(outer!.lengthMm / (2 * Math.PI * 25) - 1)).toBeLessThan(2e-5)
    expect(Math.abs(bore!.lengthMm / (2 * Math.PI * 19) - 1)).toBeLessThan(2e-5)
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
    expect(shown(detectSeams(apart, DEFAULT_DETECT_SETTINGS))).toEqual([])
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

describe('classification under transforms', () => {
  const turns = [
    { rotate: { axis: [1, 2, 3] as [number, number, number], angleDeg: 37 }, translate: [100000, 100000, 100000] as [number, number, number] },
    { rotate: { axis: [0, 1, 1] as [number, number, number], angleDeg: 11 }, translate: [-3000, 250, 40] as [number, number, number] },
    { rotate: { axis: [3, -1, 2] as [number, number, number], angleDeg: 73 }, translate: [20, 20, 20] as [number, number, number] },
    { rotate: { axis: [1, 0, 0] as [number, number, number], angleDeg: 5 }, translate: [1e5, 0, -1e5] as [number, number, number] },
  ]

  it.each(turns.map((t, i) => [i, t] as const))('keeps the merged T-joint fillets after turn %i', (_, turn) => {
    const moved = transformSoup(loadSoup('t-joint-merged'), turn)
    expect(shown(detectSeams(buildMeshModel(moved, 1), DEFAULT_DETECT_SETTINGS)).map((s) => s.jointType)).toEqual(['fillet', 'fillet'])
  })

  it.each(turns.map((t, i) => [i, t] as const))('keeps the narrow flange fillets after turn %i', (_, turn) => {
    const moved = transformSoup(soupOf(narrowFlangeT()), turn)
    expect(shown(detectSeams(buildMeshModel(moved, 1), DEFAULT_DETECT_SETTINGS)).map((s) => s.jointType)).toEqual(['fillet', 'fillet'])
  })

  it.each(turns.map((t, i) => [i, t] as const))('keeps the stepped lap laps after turn %i', (_, turn) => {
    const moved = transformSoup(soupOf(steppedLap()), turn)
    expect(shown(detectSeams(buildMeshModel(moved, 1), DEFAULT_DETECT_SETTINGS)).map((s) => s.jointType)).toEqual(['lap', 'lap'])
  })
})

describe('detectSeams under transforms', () => {
  const soup = loadSoup('t-joint-merged')
  const reference = shown(detectSeams(buildMeshModel(soup, 1), DEFAULT_DETECT_SETTINGS))

  it('still finds 2 seams on a part modelled in metres', () => {
    const metres = buildMeshModel(transformSoup(soup, { scale: 0.001 }), 1000)
    expect(shown(detectSeams(metres, DEFAULT_DETECT_SETTINGS))).toHaveLength(2)
  })

  it('gives the same seams after a 37 degree turn about an arbitrary axis and a 100000 mm move', () => {
    const moved = transformSoup(soup, {
      rotate: { axis: [1, 2, 3], angleDeg: 37 },
      translate: [100000, 100000, 100000],
    })
    const seams = shown(detectSeams(buildMeshModel(moved, 1), DEFAULT_DETECT_SETTINGS))
    expect(seams).toHaveLength(reference.length)
    seams.forEach((seam, i) => {
      expect(Math.abs(seam.lengthMm - reference[i]!.lengthMm)).toBeLessThan(0.1)
      expect(Math.abs(seam.openingAngleDeg - 90)).toBeLessThan(1)
    })
  })
})

describe('joint classification', () => {
  it('classifies every visible seam of every sample as a fillet', () => {
    for (const { id } of readManifest().samples) {
      const types = new Set(detect(id).map((s) => s.jointType))
      expect([...types], id).toEqual(['fillet'])
    }
  })

  it('keeps the loops of the bar through the plate fillets, not saddles', () => {
    const loops = detect('bar-through-plate')
    expect(loops.map((s) => [s.source, s.jointType])).toEqual([['intersection', 'fillet'], ['intersection', 'fillet']])
  })

  it('calls both contact seams of two lapped plates laps', () => {
    const lower = cubeTriangles([0, 0, 0], [100, 60, 10])
    const upper = cubeTriangles([60, 0, 10], [100, 60, 10])
    const seams = shown(detectSeams(buildMeshModel(soupOf([...lower, ...upper]), 1), DEFAULT_DETECT_SETTINGS))
    expect(seams.map((s) => [s.source, s.jointType])).toEqual([['contact', 'lap'], ['contact', 'lap']])
    for (const seam of seams) expect(seam.lengthMm).toBeCloseTo(60, 1)
  })

  it('calls a 20 mm plate lapped on a 6 mm plate a lap, as two bodies and as one', () => {
    const lower = cubeTriangles([0, 0, 0], [300, 60, 6])
    const upper = cubeTriangles([200, 0, 6], [300, 60, 20])
    const apart = shown(detectSeams(buildMeshModel(soupOf([...lower, ...upper]), 1), DEFAULT_DETECT_SETTINGS))
    expect(apart.map((s) => [s.source, s.jointType])).toEqual([['contact', 'lap'], ['contact', 'lap']])
    const merged = shown(detectSeams(buildMeshModel(soupOf(steppedLap({ lower: 6, upper: 20, length: 300, overlap: 100 })), 1), DEFAULT_DETECT_SETTINGS))
    expect(merged.map((s) => [s.source, s.jointType])).toEqual([['crease', 'lap'], ['crease', 'lap']])
    for (const seam of [...apart, ...merged]) expect([...seam.thicknessMm].sort((a, b) => a! - b!)).toEqual([6, 20])
  })

  it('calls the ends of a lap modelled as one body laps as well', () => {
    const model = buildMeshModel(soupOf(steppedLap()), 1)
    expect(model.bodies.count).toBe(1)
    const seams = shown(detectSeams(model, DEFAULT_DETECT_SETTINGS))
    expect(seams.map((s) => [s.source, s.jointType])).toEqual([['crease', 'lap'], ['crease', 'lap']])
    for (const seam of seams) expect(seam.lengthMm).toBeCloseTo(60, 1)
  })

  // The 8 mm flange top is narrow enough to be a strip on the 10 mm web, but the block behind it is only the 10 mm
  // flange: no plate long enough to lap the web lies there, so the joint is a T with a narrow flange.
  it('reads a flange strip narrower than the web as a T fillet, not a lap', () => {
    const model = buildMeshModel(soupOf(narrowFlangeT()), 1)
    expect(model.bodies.count).toBe(1)
    const seams = shown(detectSeams(model, DEFAULT_DETECT_SETTINGS))
    expect(seams.map((s) => s.jointType)).toEqual(['fillet', 'fillet'])
    for (const seam of seams) expect(seam.lengthMm).toBeCloseTo(100, 1)
  })

  it('reads the narrow flange as fillets after an arbitrary rotation and move', () => {
    const turned = transformSoup(soupOf(narrowFlangeT()), { rotate: { axis: [1, 2, 3], angleDeg: 37 }, translate: [500, -300, 800] })
    const seams = shown(detectSeams(buildMeshModel(turned, 1), DEFAULT_DETECT_SETTINGS))
    expect(seams.map((s) => s.jointType)).toEqual(['fillet', 'fillet'])
  })

  it('reads a 40 mm block on a plate as a fillet: it is shorter than the 50 mm minimum overlap of a 10 mm lap', () => {
    const lower = cubeTriangles([0, 0, 0], [100, 60, 10])
    const block = cubeTriangles([55, 0, 10], [40, 60, 10])
    const model = buildMeshModel(soupOf([...lower, ...block]), 1)
    expect(model.bodies.count).toBe(2)
    const seams = shown(detectSeams(model, DEFAULT_DETECT_SETTINGS))
    expect(seams.map((s) => [s.source, s.jointType])).toEqual([['contact', 'fillet'], ['contact', 'fillet']])
  })

  // 300 mm long, so its foot is not compact enough to be welded all round and each side is read on its own.
  it('reads a block with a 0.5 mm chamfer at its foot on a plate as fillets: the chamfer is an edge, not a lapping strip', () => {
    const plate = cubeTriangles([-20, -20, 0], [340, 100, 10])
    const block = extrude(
      [[0.5, 10], [59.5, 10], [60, 10.5], [60, 50], [0, 50], [0, 10.5]],
      [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5]],
      300,
      (y, z, x) => [x, y, z],
    )
    const seams = shown(detectSeams(buildMeshModel(soupOf([...plate, ...block]), 1), DEFAULT_DETECT_SETTINGS))
    // Two long sides along the chamfers and the two block ends.
    const contact = seams.filter((s) => s.source === 'contact')
    expect(contact.map((s) => Math.round(s.lengthMm)).sort()).toEqual([300, 300, 59, 59].sort())
    for (const seam of contact) expect(seam.jointType, `${seam.label} ${seam.lengthMm.toFixed(1)} mm`).toBe('fillet')
  })

  it('keeps a web 80 mm tall on a 10 mm plate a fillet', () => {
    expect(detect('t-joint-assembly').map((s) => s.jointType)).toEqual(['fillet', 'fillet'])
    expect(detect('t-joint-merged').map((s) => s.jointType)).toEqual(['fillet', 'fillet'])
  })
})

describe('corner candidates', () => {
  const l = () => buildMeshModel(soupOf(mergedL()), 1)

  it('offers the heel of a merged L as the one hidden corner, beside its inside fillet', () => {
    const all = detectSeams(l(), DEFAULT_DETECT_SETTINGS)
    expect(shown(all).map((s) => [s.source, s.jointType])).toEqual([['crease', 'fillet']])
    const corners = all.filter((s) => s.hidden === 'corner')
    expect(corners).toHaveLength(1)
    const [heel] = corners
    expect(heel!.jointType).toBe('corner')
    expect(heel!.source).toBe('crease')
    expect(heel!.concavity).toBe('known')
    expect(heel!.openingAngleDeg).toBeCloseTo(90, 1)
    expect(heel!.lengthMm).toBeCloseTo(60, 1)
    for (const { p } of heel!.points) {
      expect(p[0]).toBeCloseTo(0, 3)
      expect(p[2]).toBeCloseTo(0, 3)
    }
  })

  it('offers no corner on the edges of a single plate or a bar: there is no second plate', () => {
    for (const size of [[100, 60, 10], [100, 40, 40], [200, 10, 80]]) {
      const all = detectSeams(buildMeshModel(soupOf(cubeTriangles([0, 0, 0], size)), 1), DEFAULT_DETECT_SETTINGS)
      expect(all, size.join(' x ')).toEqual([])
    }
  })

  it('offers no corner on the plate and web edges of the T-joints', () => {
    for (const id of ['t-joint-merged', 't-joint-assembly', 'flipped-normals']) {
      expect(detectAll(id).filter((s) => s.hidden === 'corner'), id).toEqual([])
    }
  })

  it('skips the corner pass on a part above the triangle limit and keeps the fillets', () => {
    const model = l()
    const all = detectSeams(model, DEFAULT_DETECT_SETTINGS, { maxCornerTriangles: model.mesh.triangleCount - 1 })
    expect(all.filter((s) => s.hidden === 'corner')).toEqual([])
    expect(shown(all)).toHaveLength(1)
    expect(detectSeams(model, DEFAULT_DETECT_SETTINGS, { maxCornerTriangles: model.mesh.triangleCount }).filter((s) => s.hidden === 'corner')).toHaveLength(1)
  })

  it('marks visible seams as not hidden', () => {
    for (const seam of detect('t-joint-merged')) expect(seam.hidden).toBe(false)
  })

  // Only three samples have an outside corner where two plates meet: the heel of the L bracket, the 12 outer edges of
  // the tank shell and the 4 outer edges of each tube of the tube frame. Every other convex edge in the samples is the
  // edge of one plate, a web or a bar.
  const CORNERS: Record<string, number> = { 'l-bracket-gussets': 1, 'tank-with-manhole': 12, 'tube-frame': 5 * 4, 'tube-frame-fused': 2 * (2 + 2 * 4) + 3 * 4 }

  it('finds the hidden corners each sample has and keeps them out of the visible counts', () => {
    for (const { id } of readManifest().samples) {
      const all = detectAll(id)
      expect(all.filter((s) => s.hidden === 'corner').length, id).toBe(CORNERS[id] ?? 0)
      expect(all.filter((s) => s.hidden === 'corner').every((s) => s.jointType === 'corner'), id).toBe(true)
      expect(all.filter((s) => s.hidden === false).every((s) => s.jointType !== 'corner'), id).toBe(true)
    }
  })

  it('offers the heel of the L bracket and the 12 outer edges of the tank shell', () => {
    const [heel] = detectAll('l-bracket-gussets').filter((s) => s.hidden === 'corner')
    expect(heel!.lengthMm).toBeCloseTo(120, 1)
    for (const { p } of heel!.points) expect([p[1], p[2]]).toEqual([0, 0])
    const shell = detectAll('tank-with-manhole').filter((s) => s.hidden === 'corner')
    const onBox = (p: number[]) => [p[0] === 0 || p[0] === 1600, p[1] === 0 || p[1] === 1000, p[2] === 0 || p[2] === 1000].filter(Boolean).length >= 2
    expect(shell.every((s) => s.points.every(({ p }) => onBox(p)))).toBe(true)
    expect(shell.map((s) => Math.round(s.lengthMm)).sort((a, b) => a - b)).toEqual([...Array(8).fill(1000), ...Array(4).fill(1600)])
  })

  it('offers no corner on the edges of a plate that another body passes through', () => {
    const plate = cubeTriangles([-75, -75, 0], [150, 150, 10])
    const post = cubeTriangles([-25, -25, -25], [50, 50, 60])
    expect(detectSeams(buildMeshModel(soupOf([...plate, ...post]), 1), DEFAULT_DETECT_SETTINGS).filter((s) => s.hidden === 'corner')).toEqual([])
  })

  it('does not list a contact seam a second time as a hidden corner', () => {
    for (const id of ['t-joint-assembly', 'tank-with-manhole']) {
      const all = detectAll(id)
      const contact = all.filter((s) => s.source === 'contact')
      expect(contact.length, id).toBeGreaterThan(0)
      const middle = (s: SeamCandidate) => s.points[s.points.length >> 1]!.p
      for (const seam of all.filter((s) => s.hidden === 'corner')) {
        for (const c of contact) {
          const d = Math.hypot(...(middle(seam).map((x, i) => x - middle(c)[i]!) as [number, number, number]))
          expect(d > 1 || Math.abs(seam.lengthMm - c.lengthMm) > 1, `${seam.id} vs ${c.id}`).toBe(true)
        }
      }
    }
  })

  it('numbers visible seams first so that their labels do not move when corners are shown', () => {
    const all = detectAll('tank-with-manhole')
    const visible = all.filter((s) => s.hidden === false)
    expect(visible.map((s) => s.label)).toEqual(visible.map((_, i) => `S${i + 1}`))
    expect(all.filter((s) => s.hidden === 'corner')).toHaveLength(12)
    const hidden = all.filter((s) => s.hidden === 'corner')
    expect(hidden.map((s) => s.label)).toEqual(hidden.map((_, i) => `S${visible.length + i + 1}`))
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length)
  })

  it('offers no corner candidate in a body with no known inside', () => {
    const quad = (a: number[], b: number[], c: number[], d: number[]) => [[...a, ...b, ...c], [...a, ...c, ...d]]
    const sheet = soupOf([
      ...quad([0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0]),
      ...quad([0, 40, 0], [40, 40, 0], [40, 40, 40], [0, 40, 40]),
    ])
    const all = detectSeams(buildMeshModel(sheet, 1), DEFAULT_DETECT_SETTINGS)
    expect(all.filter((s) => s.hidden === 'corner')).toHaveLength(0)
  })
})

// The regression part for the four fixes found on a go-kart frame: tube interiors hidden, tube joints scored and taken
// by accept all, no lap read from an edge, and one weld all round each tube end.
describe('tube frame', () => {
  const all = detectAll('tube-frame')
  const seams = shown(all)

  it('offers one closed weld all round each of the 6 rung ends and nothing else', () => {
    expect(seams).toHaveLength(6)
    for (const seam of seams) {
      expect([seam.source, seam.jointType, seam.closed], seam.label).toEqual(['contact', 'fillet', true])
      expect(seam.lengthMm, seam.label).toBeCloseTo(4 * 25.4, 2)
      expect(seam.openingAngleDeg, seam.label).toBeCloseTo(90, 1)
      expect(seam.thicknessMm, seam.label).toEqual([3.18, 3.18])
    }
  })

  it('scores every joint at 0.8 or more, so accept all above 0.70 takes exactly the 6 joints', () => {
    for (const seam of seams) expect(seam.confidence, seam.label).toBeGreaterThanOrEqual(0.8)
    const taken = all.filter((s) => s.hidden !== 'hollow' && s.hidden !== 'corner' && s.confidence >= 0.7)
    expect(taken.map((s) => s.id).sort()).toEqual(seams.map((s) => s.id).sort())
  })

  it('hides the 4 inside corners of every tube and the bore of every rung end, and reads no lap', () => {
    const hollow = all.filter((s) => s.hidden === 'hollow')
    expect(hollow.filter((s) => s.source === 'crease')).toHaveLength(5 * 4)
    expect(hollow.filter((s) => s.source === 'contact').map((s) => [s.closed, Math.round(s.lengthMm * 100) / 100])).toEqual(Array(6).fill([true, 76.16]))
    expect(all.filter((s) => s.jointType === 'lap')).toEqual([])
  })
})

// The same frame as one solid: what the flat frames of the go-kart are. Each rung end has two creases and flush sides.
describe('fused tube frame', () => {
  const all = detectAll('tube-frame-fused')
  const seams = shown(all)

  it('offers one closed weld all round each of the 6 rung ends and nothing else, as the frame of separate tubes does', () => {
    expect(seams).toHaveLength(6)
    for (const seam of seams) {
      expect([seam.source, seam.jointType, seam.closed], seam.label).toEqual(['crease', 'fillet', true])
      expect(seam.lengthMm, seam.label).toBeCloseTo(4 * 25.4, 2)
      expect(seam.openingAngleDeg, seam.label).toBeCloseTo(90, 1)
      expect(seam.thicknessMm, seam.label).toEqual([3.18, 3.18])
    }
  })

  it('scores every joint at 0.8 or more, so accept all above 0.70 takes exactly the 6 joints', () => {
    for (const seam of seams) expect(seam.confidence, seam.label).toBeGreaterThanOrEqual(0.8)
    expect(all.filter((s) => s.hidden === false && s.confidence >= 0.7)).toHaveLength(6)
  })

  it('hides the 4 inside corners of each rail', () => {
    const hollow = all.filter((s) => s.hidden === 'hollow')
    expect(hollow.map((s) => [s.source, Math.round(s.lengthMm)])).toEqual(Array(8).fill(['crease', 600]))
  })
})

describe('weld all around', () => {
  // A 1 in tube with a 1/8 in wall butting the side of another at x 287.3: its top and bottom are flush with the rail.
  const rail = boxTube(25.4, 25.4, 3.18, 600, (u, v, w) => [w, u, v])
  const rung = boxTube(25.4, 25.4, 3.18, 249.2, (u, v, w) => [287.3 + u, 25.4 + w, v])
  const all = detectSeams(buildMeshModel(soupOf([...rail, ...rung]), 1), DEFAULT_DETECT_SETTINGS)
  const loop = shown(all).find((s) => s.source === 'contact')!

  it('offers the four sides of the tube end as one closed fillet of 101.6 mm, above 0.80', () => {
    expect(shown(all).map((s) => [s.source, s.jointType, s.closed])).toEqual([['contact', 'fillet', true]])
    expect(loop.lengthMm).toBeCloseTo(101.6, 2)
    expect(loop.openingAngleDeg).toBeCloseTo(90, 1)
    expect(loop.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('hides the loop round the bore and the inside corners of both tubes as hollow', () => {
    const hollow = all.filter((s) => s.hidden === 'hollow')
    expect(hollow.filter((s) => s.source === 'contact').map((s) => [s.closed, Math.round(s.lengthMm * 100) / 100])).toEqual([[true, 76.16]])
    expect(hollow.filter((s) => s.source === 'crease')).toHaveLength(8)
  })

  it('keeps the four corners of the tube end on the seam', () => {
    for (const [x, z] of [[287.3, 0], [312.7, 0], [312.7, 25.4], [287.3, 25.4]]) {
      const nearest = Math.min(...loop.points.map(({ p }) => Math.hypot(p[0] - x!, p[1] - 25.4, p[2] - z!)))
      expect(nearest, `${x} ${z}`).toBeLessThan(1e-3)
    }
  })

  it('blends the torch at the four corners instead of turning on the spot', () => {
    const steps = (blendMm: number) => {
      const poses = torchPoses(loop.points, true, { ...DEFAULT_TORCH, cornerBlendMm: blendMm })
      return poses.map((pose, i) => angleBetweenQuat(pose.q, poses[(i + 1) % poses.length]!.q))
    }
    expect(steps(0).filter((deg) => deg > 10)).toHaveLength(4)
    expect(Math.max(...steps(DEFAULT_TORCH.cornerBlendMm))).toBeLessThan(Math.max(...steps(0)) / 2)
  })
})

describe('seams inside hollow sections', () => {
  // Only the tube frame has a tube or a closed box under 150 mm across: the tank, the double-bottom cell and the box
  // girder are wide or open inside, so none of their seams is hidden as hollow.
  const HOLLOW: Record<string, number> = { 'tube-frame': 5 * 4 + 6, 'tube-frame-fused': 2 * 4 }

  it('finds the hollow seams each sample has, as fillets kept out of the visible counts', () => {
    for (const { id } of readManifest().samples) {
      const hollow = detectAll(id).filter((s) => s.hidden === 'hollow')
      expect(hollow.length, id).toBe(HOLLOW[id] ?? 0)
      for (const seam of hollow) expect(['crease', 'contact'].includes(seam.source) && seam.jointType === 'fillet', `${id} ${seam.label}`).toBe(true)
    }
  })
})

describe('plate thickness per seam', () => {
  const pairs = (id: string) => detect(id).map((s) => s.thicknessMm)
  const sorted = (t: SeamCandidate['thicknessMm']) => [...t].sort((a, b) => a! - b!)

  it('measures 10 and 10 on every seam of both T-joints', () => {
    for (const id of ['t-joint-merged', 't-joint-assembly']) {
      const t = pairs(id)
      expect(t.length, id).toBe(2)
      for (const [a, b] of t) {
        expect(a, id).toBeCloseTo(10, 2)
        expect(b, id).toBeCloseTo(10, 2)
      }
    }
  })

  it('measures 8 and 8 on every seam of the L-bracket with gussets', () => {
    const t = pairs('l-bracket-gussets')
    expect(t).toHaveLength(16)
    for (const [a, b] of t) {
      expect(a).toBeCloseTo(8, 2)
      expect(b).toBeCloseTo(8, 2)
    }
  })

  it('measures 6 and 10 on the outer loop and the bore loop of the pipe on plate', () => {
    const t = pairs('pipe-on-plate').map(sorted)
    expect(t).toHaveLength(2)
    for (const [a, b] of t) {
      expect(a).toBeCloseTo(6, 1)
      expect(b).toBeCloseTo(10, 1)
    }
  })

  it('measures 50 and 10 on both loops of the bar through the plate', () => {
    const t = pairs('bar-through-plate').map(sorted)
    expect(t).toHaveLength(2)
    for (const [a, b] of t) {
      expect(a).toBeCloseTo(10, 1)
      expect(b).toBeCloseTo(50, 1)
    }
  })

  it('finds the four plate pairs of the double-bottom cell', () => {
    const key = (t: SeamCandidate['thicknessMm']) => sorted(t).map((x) => x!.toFixed(1)).join('/')
    const counts = new Map<string, number>()
    for (const t of pairs('double-bottom-cell')) counts.set(key(t), (counts.get(key(t)) ?? 0) + 1)
    expect([...counts.keys()].sort()).toEqual(['10.0/12.0', '8.0/10.0', '8.0/12.0', '8.0/8.0'])
  })

  it('takes the strip width as the strip entry of a lap, 10 on 10', () => {
    const lower = cubeTriangles([0, 0, 0], [100, 60, 10])
    const upper = cubeTriangles([60, 0, 10], [100, 60, 10])
    const seams = shown(detectSeams(buildMeshModel(soupOf([...lower, ...upper]), 1), DEFAULT_DETECT_SETTINGS))
    expect(seams.map((s) => s.jointType)).toEqual(['lap', 'lap'])
    for (const { thicknessMm: [a, b] } of seams) {
      expect(a).toBeCloseTo(10, 2)
      expect(b).toBeCloseTo(10, 2)
    }
  })

  it('puts the strip width in the strip entry when the strip is thinner than the plate', () => {
    const lower = cubeTriangles([0, 0, 0], [100, 60, 10])
    const upper = cubeTriangles([60, 0, 10], [100, 60, 6])
    const seams = shown(detectSeams(buildMeshModel(soupOf([...lower, ...upper]), 1), DEFAULT_DETECT_SETTINGS))
    const lap = seams.find((s) => s.jointType === 'lap')!
    expect(lap).toBeDefined()
    expect(sorted(lap.thicknessMm)[0]).toBeCloseTo(6, 2)
    expect(sorted(lap.thicknessMm)[1]).toBeCloseTo(10, 2)
  })

  it('gives multiples of 0.01 on every sample', () => {
    for (const { id } of readManifest().samples) {
      for (const seam of detectAll(id)) {
        for (const v of seam.thicknessMm) {
          if (v !== null) expect(Math.abs(v * 100 - Math.round(v * 100)), `${id} ${seam.id}`).toBeLessThan(1e-6)
        }
      }
    }
  })

  // Next to the edge a ray behind either face of a corner runs through the other plate and reads its extent (100 on
  // the L, 80 on the bracket, 1000 or 1600 on the tank), so each plate is measured across the span of its face.
  it('measures the plate thickness behind each face of a corner, not the extent of the other plate', () => {
    const [heel] = detectSeams(buildMeshModel(soupOf(mergedL()), 1), DEFAULT_DETECT_SETTINGS).filter((s) => s.hidden === 'corner')
    expect(heel!.thicknessMm).toEqual([10, 10])
    const [bracket] = detectAll('l-bracket-gussets').filter((s) => s.hidden === 'corner')
    expect(bracket!.thicknessMm).toEqual([8, 8])
    const shell = detectAll('tank-with-manhole').filter((s) => s.hidden === 'corner')
    expect(shell).toHaveLength(12)
    for (const c of shell) expect(c.thicknessMm, c.label).toEqual([8, 8])
  })
})
