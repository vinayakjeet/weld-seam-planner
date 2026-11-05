import { describe, expect, it } from 'vitest'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { parseStl } from '../../../src/core/mesh/parseStl'
import { buildBodyBvhs } from '../../../src/core/seams/bodyBvh'
import { DEFAULT_DETECT_SETTINGS, detectSeams, type SeamCandidate } from '../../../src/core/seams/detect'
import { loadSampleModel, loadSoup, transformSoup } from '../helpers/models'
import { readManifest, readSample } from '../helpers/samples'
import { cubeTriangles, mergedL, narrowFlangeT, soupOf, steppedLap } from '../helpers/shapes'
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

  it('measures the contact lengths: 4 of 864 mm, 4 of 272 mm and one closed loop of 1934 mm, all fillets', () => {
    expect(count('contact', 864, 2)).toBe(4)
    expect(count('contact', 272, 2)).toBe(4)
    const loops = seams.filter((s) => s.source === 'contact' && s.closed)
    expect(loops).toHaveLength(1)
    expect(Math.abs(loops[0]!.lengthMm - 1934)).toBeLessThanOrEqual(2)
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

  it.each(turns.map((t, i) => [i, t] as const))('keeps the narrow flange laps after turn %i', (_, turn) => {
    const moved = transformSoup(soupOf(narrowFlangeT()), turn)
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

  it('calls the ends of a lap modelled as one body laps as well', () => {
    const model = buildMeshModel(soupOf(steppedLap()), 1)
    expect(model.bodies.count).toBe(1)
    const seams = shown(detectSeams(model, DEFAULT_DETECT_SETTINGS))
    expect(seams.map((s) => [s.source, s.jointType])).toEqual([['crease', 'lap'], ['crease', 'lap']])
    for (const seam of seams) expect(seam.lengthMm).toBeCloseTo(60, 1)
  })

  it('reads a flange strip narrower than the web as a lap whichever face is the free one', () => {
    const model = buildMeshModel(soupOf(narrowFlangeT()), 1)
    expect(model.bodies.count).toBe(1)
    const seams = shown(detectSeams(model, DEFAULT_DETECT_SETTINGS))
    expect(seams.map((s) => s.jointType)).toEqual(['lap', 'lap'])
    for (const seam of seams) expect(seam.lengthMm).toBeCloseTo(100, 1)
  })

  it('reads the narrow flange strips as laps after an arbitrary rotation and move', () => {
    const turned = transformSoup(soupOf(narrowFlangeT()), { rotate: { axis: [1, 2, 3], angleDeg: 37 }, translate: [500, -300, 800] })
    const seams = shown(detectSeams(buildMeshModel(turned, 1), DEFAULT_DETECT_SETTINGS))
    expect(seams.map((s) => s.jointType)).toEqual(['lap', 'lap'])
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
    const corners = all.filter((s) => s.hidden)
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
      expect(detectAll(id).filter((s) => s.hidden), id).toEqual([])
    }
  })

  it('skips the corner pass on a part above the triangle limit and keeps the fillets', () => {
    const model = l()
    const all = detectSeams(model, DEFAULT_DETECT_SETTINGS, { maxCornerTriangles: model.mesh.triangleCount - 1 })
    expect(all.filter((s) => s.hidden)).toEqual([])
    expect(shown(all)).toHaveLength(1)
    expect(detectSeams(model, DEFAULT_DETECT_SETTINGS, { maxCornerTriangles: model.mesh.triangleCount }).filter((s) => s.hidden)).toHaveLength(1)
  })

  it('marks visible seams as not hidden', () => {
    for (const seam of detect('t-joint-merged')) expect(seam.hidden).toBe(false)
  })

  // Only two samples have an outside corner where two plates meet: the heel of the L bracket and the 12 outer edges of
  // the tank shell. Every other convex edge in the samples is the edge of one plate, a web or a bar.
  const CORNERS: Record<string, number> = { 'l-bracket-gussets': 1, 'tank-with-manhole': 12 }

  it('finds the hidden corners each sample has and keeps them out of the visible counts', () => {
    for (const { id } of readManifest().samples) {
      const all = detectAll(id)
      expect(all.filter((s) => s.hidden).length, id).toBe(CORNERS[id] ?? 0)
      expect(all.filter((s) => s.hidden).every((s) => s.jointType === 'corner'), id).toBe(true)
      expect(all.filter((s) => !s.hidden).every((s) => s.jointType !== 'corner'), id).toBe(true)
    }
  })

  it('offers the heel of the L bracket and the 12 outer edges of the tank shell', () => {
    const [heel] = detectAll('l-bracket-gussets').filter((s) => s.hidden)
    expect(heel!.lengthMm).toBeCloseTo(120, 1)
    for (const { p } of heel!.points) expect([p[1], p[2]]).toEqual([0, 0])
    const shell = detectAll('tank-with-manhole').filter((s) => s.hidden)
    const onBox = (p: number[]) => [p[0] === 0 || p[0] === 1600, p[1] === 0 || p[1] === 1000, p[2] === 0 || p[2] === 1000].filter(Boolean).length >= 2
    expect(shell.every((s) => s.points.every(({ p }) => onBox(p)))).toBe(true)
    expect(shell.map((s) => Math.round(s.lengthMm)).sort((a, b) => a - b)).toEqual([...Array(8).fill(1000), ...Array(4).fill(1600)])
  })

  it('offers no corner on the edges of a plate that another body passes through', () => {
    const plate = cubeTriangles([-75, -75, 0], [150, 150, 10])
    const post = cubeTriangles([-25, -25, -25], [50, 50, 60])
    expect(detectSeams(buildMeshModel(soupOf([...plate, ...post]), 1), DEFAULT_DETECT_SETTINGS).filter((s) => s.hidden)).toEqual([])
  })

  it('does not list a contact seam a second time as a hidden corner', () => {
    for (const id of ['t-joint-assembly', 'tank-with-manhole']) {
      const all = detectAll(id)
      const contact = all.filter((s) => s.source === 'contact')
      expect(contact.length, id).toBeGreaterThan(0)
      const middle = (s: SeamCandidate) => s.points[s.points.length >> 1]!.p
      for (const seam of all.filter((s) => s.hidden)) {
        for (const c of contact) {
          const d = Math.hypot(...(middle(seam).map((x, i) => x - middle(c)[i]!) as [number, number, number]))
          expect(d > 1 || Math.abs(seam.lengthMm - c.lengthMm) > 1, `${seam.id} vs ${c.id}`).toBe(true)
        }
      }
    }
  })

  it('numbers visible seams first so that their labels do not move when corners are shown', () => {
    const all = detectAll('tank-with-manhole')
    const visible = all.filter((s) => !s.hidden)
    expect(visible.map((s) => s.label)).toEqual(visible.map((_, i) => `S${i + 1}`))
    expect(all.filter((s) => s.hidden)).toHaveLength(12)
    const hidden = all.filter((s) => s.hidden)
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
    expect(all.filter((s) => s.hidden)).toHaveLength(0)
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

  it('measures a thickness behind each face of the heel of an L', () => {
    const corners = detectSeams(buildMeshModel(soupOf(mergedL()), 1), DEFAULT_DETECT_SETTINGS).filter((s) => s.hidden)
    expect(corners).toHaveLength(1)
    for (const c of corners) {
      expect(c.jointType).toBe('corner')
      expect(c.thicknessMm.every((v) => v !== null)).toBe(true)
    }
  })
})
