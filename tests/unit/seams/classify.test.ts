import { describe, expect, it } from 'vitest'
import { computeFaceData } from '../../../src/core/mesh/faces'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { buildBodyBvhs, buildWholeBvh } from '../../../src/core/seams/bodyBvh'
import { classifyJoint, patchWidth, thicknessBehind } from '../../../src/core/seams/classify'
import { loadSampleModel } from '../helpers/models'
import { cubeTriangles, soupOf } from '../helpers/shapes'

const loop = (radius: number, height: (theta: number) => number, count = 72) =>
  Array.from({ length: count }, (_, k) => {
    const theta = (2 * Math.PI * k) / count
    return { p: [radius * Math.cos(theta), radius * Math.sin(theta), height(theta)] as [number, number, number] }
  })

const base = { source: 'crease' as const, closed: false, points: [], stripWidthMm: 80, touchedThicknessMm: 10, stripLengthMm: 10, convex: false }

describe('classifyJoint', () => {
  it('calls the end face of a plate lying on another a lap and the side of a standing web a fillet', () => {
    // A 10 mm plate lapped 100 mm on a 10 mm plate: the strip is 10 wide and its plate runs 100 behind it.
    expect(classifyJoint({ ...base, stripWidthMm: 10, stripLengthMm: 100 })).toBe('lap')
    // The side of an 80 mm web has only the 10 mm web behind it.
    expect(classifyJoint({ ...base, stripWidthMm: 80, stripLengthMm: 10 })).toBe('fillet')
  })

  it('calls plates of very different thickness a lap whichever one lies on top', () => {
    expect(classifyJoint({ ...base, stripWidthMm: 20, touchedThicknessMm: 6, stripLengthMm: 100 })).toBe('lap')
    expect(classifyJoint({ ...base, stripWidthMm: 3, touchedThicknessMm: 40, stripLengthMm: 100 })).toBe('lap')
  })

  it('needs the strip to be the narrow end of its plate', () => {
    // A web 30 thick and 80 tall on a 6 mm flange runs only 30 behind its 80 mm side.
    expect(classifyJoint({ ...base, stripWidthMm: 80, touchedThicknessMm: 6, stripLengthMm: 30 })).toBe('fillet')
    expect(classifyJoint({ ...base, stripWidthMm: 30, touchedThicknessMm: 6, stripLengthMm: 29.9 })).toBe('fillet')
    expect(classifyJoint({ ...base, stripWidthMm: 30, touchedThicknessMm: 6, stripLengthMm: 30 })).toBe('lap')
  })

  it('applies the lap rule to contact seams too', () => {
    expect(classifyJoint({ ...base, source: 'contact', stripWidthMm: 10, stripLengthMm: 100 })).toBe('lap')
  })

  // AWS D1.1 asks a lap for an overlap of five times the thinner part and at least 25 mm, so the plate behind the strip
  // must reach that far. A strip on a shorter block is the overhang of a narrow flange.
  it('calls a strip a lap only when the plate behind it is as long as the minimum lap overlap', () => {
    expect(classifyJoint({ ...base, stripWidthMm: 8, stripLengthMm: 10 })).toBe('fillet')
    expect(classifyJoint({ ...base, stripWidthMm: 10, stripLengthMm: 49.9 })).toBe('fillet')
    expect(classifyJoint({ ...base, stripWidthMm: 10, stripLengthMm: 50 })).toBe('lap')
    expect(classifyJoint({ ...base, stripWidthMm: 3, stripLengthMm: 24.9 })).toBe('fillet')
    expect(classifyJoint({ ...base, stripWidthMm: 3, stripLengthMm: 25 })).toBe('lap')
    expect(classifyJoint({ ...base, stripWidthMm: 12, touchedThicknessMm: 8, stripLengthMm: 40 })).toBe('lap')
    expect(classifyJoint({ ...base, stripWidthMm: 12, touchedThicknessMm: 8, stripLengthMm: 39.9 })).toBe('fillet')
  })

  it('never calls a seam a lap when a plate behind it is unknown', () => {
    for (const touchedThicknessMm of [Infinity, NaN, 0]) {
      expect(classifyJoint({ ...base, stripWidthMm: 5, stripLengthMm: 100, touchedThicknessMm }), String(touchedThicknessMm)).toBe('fillet')
    }
    for (const stripLengthMm of [Infinity, NaN, 0]) {
      expect(classifyJoint({ ...base, stripWidthMm: 5, stripLengthMm }), String(stripLengthMm)).toBe('fillet')
    }
    expect(classifyJoint({ ...base, stripWidthMm: Infinity, stripLengthMm: 100 })).toBe('fillet')
  })

  it('calls every convex edge a corner, whatever its width', () => {
    expect(classifyJoint({ ...base, convex: true })).toBe('corner')
    expect(classifyJoint({ ...base, convex: true, stripWidthMm: 5 })).toBe('corner')
  })

  it('calls a planar intersection loop a fillet', () => {
    const seam = { ...base, source: 'intersection' as const, closed: true, stripWidthMm: Infinity, touchedThicknessMm: Infinity }
    expect(classifyJoint({ ...seam, points: loop(20, () => 0) })).toBe('fillet')
    expect(classifyJoint({ ...seam, points: loop(20, () => 3).map(({ p }) => ({ p: [p[0], p[1], p[2] + p[0] * 0.5] as typeof p })) })).toBe(
      'fillet',
    )
  })

  it('calls the non-planar loop r = 20, z = 8 sin 2 theta a saddle', () => {
    const seam = { ...base, source: 'intersection' as const, closed: true, stripWidthMm: Infinity, touchedThicknessMm: Infinity }
    expect(classifyJoint({ ...seam, points: loop(20, (theta) => 8 * Math.sin(2 * theta)) })).toBe('saddle')
  })

  it('puts the saddle boundary at 3% of the mean radius', () => {
    const seam = { ...base, source: 'intersection' as const, closed: true, stripWidthMm: Infinity, touchedThicknessMm: Infinity }
    expect(classifyJoint({ ...seam, points: loop(20, (theta) => 0.5 * Math.sin(2 * theta)) })).toBe('fillet')
    expect(classifyJoint({ ...seam, points: loop(20, (theta) => 0.7 * Math.sin(2 * theta)) })).toBe('saddle')
  })

  it('keeps an open straight intersection chain a fillet', () => {
    const points = Array.from({ length: 10 }, (_, k) => ({ p: [k * 5, 2 * k, 0] as [number, number, number] }))
    expect(classifyJoint({ ...base, source: 'intersection', points, stripWidthMm: Infinity })).toBe('fillet')
  })

  it('does not call a nonmanifold or manual seam a lap by accident', () => {
    expect(classifyJoint({ ...base, source: 'nonmanifold', stripWidthMm: Infinity })).toBe('fillet')
  })
})

describe('patchWidth', () => {
  const model = loadSampleModel('t-joint-merged')
  const faces = computeFaceData(model.mesh)
  const find = (normal: number[], accept: (centroid: number[]) => boolean) => {
    for (let f = 0; f < model.mesh.triangleCount; f++) {
      const n = [faces.normals[f * 3]!, faces.normals[f * 3 + 1]!, faces.normals[f * 3 + 2]!]
      const c = [faces.centroids[f * 3]!, faces.centroids[f * 3 + 1]!, faces.centroids[f * 3 + 2]!]
      if (n.every((x, i) => Math.abs(x - normal[i]!) < 1e-6) && accept(c)) return { f, c }
    }
    throw new Error('face not found')
  }
  const web = find([0, 1, 0], (c) => c[2]! > 10)
  const top = find([0, 0, 1], (c) => Math.abs(c[2]! - 10) < 1e-6 && c[1]! > web.c[1]!)
  const seamPoint: [number, number, number] = [model.bounds.max[0] / 2, web.c[1]!, 10]
  const along: [number, number, number] = [1, 0, 0]

  it('measures the web side as its full height above the seam', () => {
    expect(patchWidth(model, faces, web.f, seamPoint, along)).toBeCloseTo(model.bounds.max[2] - 10, 3)
  })

  it('measures the plate top from the seam to the plate edge', () => {
    expect(patchWidth(model, faces, top.f, seamPoint, along)).toBeCloseTo(model.bounds.max[1] - web.c[1]!, 3)
  })

  it('does not depend on the direction the tangent points', () => {
    expect(patchWidth(model, faces, web.f, seamPoint, [-1, 0, 0])).toBeCloseTo(model.bounds.max[2] - 10, 3)
  })

  it('stops growing once the width is past the cap', () => {
    const capped = patchWidth(model, faces, web.f, seamPoint, along, 20)
    expect(capped).toBeGreaterThan(20)
  })

  it('does not cross a crease into the next plate', () => {
    const cube = buildMeshModel(soupOf(cubeTriangles([0, 0, 0], [30, 30, 7])), 1)
    const cubeFaces = computeFaceData(cube.mesh)
    const side = Array.from({ length: cube.mesh.triangleCount }, (_, f) => f).find((f) => cubeFaces.normals[f * 3 + 1]! === 1)!
    expect(patchWidth(cube, cubeFaces, side, [15, 30, 0], [1, 0, 0])).toBeCloseTo(7, 4)
  })
})

describe('thicknessBehind', () => {
  const plate = cubeTriangles([-100, -60, 0], [200, 120, 10])
  const web = cubeTriangles([-100, -5, 10], [200, 10, 80])
  const bvhs = buildBodyBvhs(buildMeshModel(soupOf([...plate, ...web]), 1))

  it('measures the plate under its top face', () => {
    expect(thicknessBehind(bvhs[0]!.bvh, [0, 30, 10], [0, 0, 1])).toBeCloseTo(10, 2)
  })

  it('measures the web through its side face', () => {
    expect(thicknessBehind(bvhs[1]!.bvh, [0, 5, 50], [0, 1, 0])).toBeCloseTo(10, 2)
  })

  it('is unaffected by the position along a face', () => {
    expect(thicknessBehind(bvhs[0]!.bvh, [-90, -50, 10], [0, 0, 1])).toBeCloseTo(10, 2)
  })

  it('reports Infinity where nothing lies behind the surface', () => {
    const sheet = buildMeshModel(
      soupOf([
        [0, 0, 0, 10, 0, 0, 10, 10, 0],
        [0, 0, 0, 10, 10, 0, 0, 10, 0],
      ]),
      1,
    )
    expect(thicknessBehind(buildWholeBvh(sheet).bvh, [5, 5, 0], [0, 0, 1])).toBe(Infinity)
  })
})
