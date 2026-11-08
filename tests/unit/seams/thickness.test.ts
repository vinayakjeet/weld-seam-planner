import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../../../src/core/math/vec3'
import { pointsFromPolyline } from '../../../src/core/seams/frames'
import { cornerThickness, plateProbeFromBvhs, probeFromBvhs, seamThickness, type RayProbe } from '../../../src/core/seams/thickness'
import { buildBodyBvhs } from '../../../src/core/seams/bodyBvh'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { cubeTriangles, soupOf } from '../helpers/shapes'

type Box = { min: Vec3; max: Vec3 }

// Distance along a ray from a point on the surface to where it leaves the union of boxes (slab method).
function exitProbe(boxes: Box[]): RayProbe {
  return (origin, dir) => {
    const inside = (p: Vec3, b: Box) => p.every((x, c) => x >= b.min[c]! - 1e-9 && x <= b.max[c]! + 1e-9)
    const start: Vec3 = [origin[0] + dir[0] * 1e-6, origin[1] + dir[1] * 1e-6, origin[2] + dir[2] * 1e-6]
    const box = boxes.find((b) => inside(start, b))
    if (!box) return Infinity
    let exit = Infinity
    for (let c = 0; c < 3; c++) {
      const d = dir[c]!
      if (d > 0) exit = Math.min(exit, (box.max[c]! - origin[c]!) / d)
      else if (d < 0) exit = Math.min(exit, (box.min[c]! - origin[c]!) / d)
    }
    return exit
  }
}

// A T: plate of the given thickness (z from 0), web of the given thickness centred on x = 0, seam on the +x side.
function tJoint(plateT: number, webT: number) {
  const boxes: Box[] = [
    { min: [-100, -10, 0], max: [100, 300, plateT] },
    { min: [-webT / 2, -10, plateT], max: [webT / 2, 300, plateT + 80] },
  ]
  const { points } = pointsFromPolyline([[webT / 2, 0, plateT], [webT / 2, 200, plateT]], false, () => [[0, 0, 1], [1, 0, 0]])
  return { boxes, points }
}

describe('seamThickness', () => {
  it('measures a T with a 10 mm plate and a 10 mm web as 10 and 10', () => {
    const { boxes, points } = tJoint(10, 10)
    const [a, b] = seamThickness(points, exitProbe(boxes))
    expect(a).toBeCloseTo(10, 2)
    expect(b).toBeCloseTo(10, 2)
  })

  it('reports the pair in n1, n2 order: a 6 mm web on a 20 mm plate', () => {
    const { boxes, points } = tJoint(20, 6)
    // n1 x n2 must point along the tangent, so n1 is the plate top (z) and n2 the web (x)
    expect(points[0]!.n1).toEqual([0, 0, 1])
    const [a, b] = seamThickness(points, exitProbe(boxes))
    expect(a).toBeCloseTo(20, 2)
    expect(b).toBeCloseTo(6, 2)
  })

  it('gives the web first when the seam runs the other way', () => {
    const { boxes, points } = tJoint(20, 6)
    const reversed = points
      .map((pt) => ({ s: points[points.length - 1]!.s - pt.s, p: pt.p, t: [-pt.t[0], -pt.t[1], -pt.t[2]] as Vec3, n1: pt.n2, n2: pt.n1 }))
      .reverse()
    const [a, b] = seamThickness(reversed, exitProbe(boxes))
    expect(a).toBeCloseTo(6, 2)
    expect(b).toBeCloseTo(20, 2)
  })

  it('starts the ray 1 mm along each face by default and takes the offset as a parameter', () => {
    const { points } = tJoint(10, 10)
    const origins: Vec3[] = []
    seamThickness(points, (origin) => (origins.push(origin), 10))
    const mid = points[Math.round(0.5 * (points.length - 1))]!
    const seen = origins.map((o) => o.join(','))
    expect(seen).toContain([mid.p[0] + 1, mid.p[1], mid.p[2]].join(','))
    expect(seen).toContain([mid.p[0], mid.p[1], mid.p[2] + 1].join(','))
    origins.length = 0
    seamThickness(points, (origin) => (origins.push(origin), 10), 2.5)
    expect(origins.map((o) => o.join(','))).toContain([mid.p[0] + 2.5, mid.p[1], mid.p[2]].join(','))
  })

  it('gives null for a face whose ray misses, and keeps the other', () => {
    const { points } = tJoint(10, 10)
    const [a, b] = seamThickness(points, (_, dir) => (dir[0] !== 0 ? Infinity : 10))
    expect(a).toBe(10)
    expect(b).toBeNull()
  })

  it('takes the median of the other two when one of three samples misses', () => {
    const { points } = tJoint(10, 10)
    const first = points[Math.round(0.25 * (points.length - 1))]!.p[1]
    const mid = points[Math.round(0.5 * (points.length - 1))]!.p[1]
    const [a] = seamThickness(points, (origin) => (origin[1] === first ? Infinity : origin[1] === mid ? 10 : 12))
    expect(a).toBe(11)
  })

  it('takes the median of three, not the mean', () => {
    const { points } = tJoint(10, 10)
    const values = new Map<number, number>()
    for (const f of [0.25, 0.5, 0.75]) values.set(points[Math.round(f * (points.length - 1))]!.p[1], f === 0.5 ? 10 : f === 0.25 ? 30 : 11)
    const [a] = seamThickness(points, (origin) => values.get(origin[1]) ?? 10)
    expect(a).toBe(11)
  })

  it('rounds to 0.01 mm so a table boundary does not flip on ray noise', () => {
    const { points } = tJoint(10, 10)
    const [a, b] = seamThickness(points, () => 6.00003)
    expect(a).toBe(6)
    expect(b).toBe(6)
    const [c] = seamThickness(points, () => 12.004)
    expect(c).toBe(12)
  })

  it('gives nulls for an empty seam and for a probe that always misses', () => {
    expect(seamThickness([], () => 10)).toEqual([null, null])
    const { points } = tJoint(10, 10)
    expect(seamThickness(points, () => Infinity)).toEqual([null, null])
  })

})

// Distance along a ray to where it leaves a union of boxes, stepping from box to box.
function unionProbe(boxes: Box[]): RayProbe {
  const single = boxes.map((b) => exitProbe([b]))
  return (origin, dir) => {
    let travelled = 0
    for (let step = 0; step < 16; step++) {
      const at: Vec3 = [origin[0] + dir[0] * travelled, origin[1] + dir[1] * travelled, origin[2] + dir[2] * travelled]
      const exits = single.map((probe) => probe(at, dir)).filter((d) => Number.isFinite(d) && d > 1e-9)
      if (exits.length === 0) return step === 0 ? Infinity : travelled
      travelled += Math.max(...exits)
    }
    return travelled
  }
}

describe('seamThickness on a loop with corners', () => {
  // A 40 mm square loop whose corners are samples: at 25, 50 and 75 percent of the samples it stands on a corner.
  const square: Vec3[] = [[0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0]]
  const { points } = pointsFromPolyline(square, true, () => [[0, 0, 1], [0, 1, 0]], { cornerDeg: 40 })

  it('measures in the middle of the side that leaves a corner sample, clear of the wall that ends there', () => {
    const origins: Vec3[] = []
    const probe: RayProbe = (origin) => {
      origins.push(origin)
      return 3.18
    }
    expect(seamThickness(points, probe)).toEqual([3.18, 3.18])
    for (const o of origins) {
      const corner = Math.min(...square.map((c) => Math.hypot(o[0] - c[0], o[1] - c[1])))
      expect(corner, o.join(' ')).toBeGreaterThan(15)
    }
  })
})

describe('a plate reading under 1 mm', () => {
  const corner: Vec3[] = [[0, 0, 0], [40, 0, 0]]
  const { points } = pointsFromPolyline(corner, false, () => [[0, 0, 1], [0, 1, 0]])

  it('is unknown in a seam: the ray met a sliver or an edge, not a plate', () => {
    expect(seamThickness(points, () => 0.62)).toEqual([null, null])
    expect(seamThickness(points, () => 0.999)).toEqual([null, null])
    expect(seamThickness(points, () => 1)).toEqual([1, 1])
  })

  it('leaves the other stations to decide when only some read under 1 mm', () => {
    const readings = [0.62, 3.18, 3.18, 3.18, 3.18, 3.18]
    expect(seamThickness(points, () => readings.shift()!)).toEqual([3.18, 3.18])
  })

  it('is unknown at an outside corner too', () => {
    const heel = [{ s: 0, p: [0, 0, 0] as Vec3, t: [1, 0, 0] as Vec3, n1: [0, 0, 1] as Vec3, n2: [0, 1, 0] as Vec3 }]
    expect(cornerThickness(heel, () => 0.62, 0.05)).toEqual([null, null])
  })
})

describe('seamThickness on a loop whose sides read differently', () => {
  it('measures the middle of every side, so a loop with flush sides still reads its one real side', () => {
    const square: Vec3[] = [[0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0]]
    const { points } = pointsFromPolyline(square, true, () => [[0, 0, 1], [0, 1, 0]], { cornerDeg: 40 })
    // Rays only meet material beside the first side, the one the loop starts on.
    const probe: RayProbe = (origin) => (origin[1] < 5 && origin[0] > 15 && origin[0] < 25 ? 3.18 : Infinity)
    expect(seamThickness(points, probe)).toEqual([3.18, 3.18])
  })
})

describe('seamThickness on a seam without such a corner', () => {
  it('keeps its three stations at 25, 50 and 75 percent of the samples, even past a 30 degree kink', () => {
    const { points } = pointsFromPolyline([[0, 0, 0], [40, 0, 0], [40 + 40 * Math.cos(Math.PI / 6), 40 * Math.sin(Math.PI / 6), 0]], false, () => [[0, 0, 1], [0, 1, 0]], { cornerDeg: 40 })
    const stations: Vec3[] = []
    seamThickness(points, (origin) => {
      stations.push(origin)
      return 5
    }, 0)
    const expected = [0.25, 0.5, 0.75].map((f) => points[Math.round(f * (points.length - 1))]!.p)
    expect(stations.filter((_, i) => i % 2 === 0)).toEqual(expected)
  })
})

describe('cornerThickness', () => {
  // The seam is the edge along y at x 0, z 0, plate normals +z and +x.
  const { points } = pointsFromPolyline([[0, 0, 0], [0, 200, 0]], false, () => [[0, 0, 1], [1, 0, 0]])
  const flat: Box = { min: [-100, -10, -10], max: [0, 300, 0] }
  const upright: Box = { min: [-10, -10, -100], max: [0, 300, 0] }

  it('measures each plate of an L as 10, not the 100 mm of the other plate behind the edge', () => {
    expect(cornerThickness(points, unionProbe([flat, upright]), 0.05)).toEqual([10, 10])
    expect(cornerThickness(points, unionProbe([upright, flat]), 0.05)).toEqual([10, 10])
  })

  it('reads the plate extent behind the end face of a lone plate, which is why such edges are not corners', () => {
    expect(cornerThickness(points, unionProbe([flat]), 0.05)).toEqual([10, 100])
  })

  it('gives nulls for an empty seam and for a probe that always misses', () => {
    expect(cornerThickness([], unionProbe([flat]), 0.05)).toEqual([null, null])
    expect(cornerThickness(points, () => Infinity, 0.05)).toEqual([null, null])
  })
})

describe('plateProbeFromBvhs', () => {
  // A 10 mm plate, a block 0.3 mm above it, and a 4 mm tube wall whose bore is a body of its own.
  const plate = cubeTriangles([0, 0, 0], [100, 60, 10])
  const bvhs = () => buildBodyBvhs(buildMeshModel(soupOf([...plate, ...cubeTriangles([20, 10, 10.3], [10, 40, 40])]), 1)).map((b) => b.bvh)

  it('measures the plate across a gap the ray starts in, from where it enters to where it leaves', () => {
    const probe = plateProbeFromBvhs(bvhs(), 0.5)
    expect(probe([60, 30, 10.3], [0, 0, -1])).toBeCloseTo(10, 4)
    expect(probeFromBvhs(bvhs())([60, 30, 10.3], [0, 0, -1])).toBeCloseTo(0.3, 4)
  })

  it('measures from the start as before when the ray starts on the plate', () => {
    expect(plateProbeFromBvhs(bvhs(), 0.5)([60, 30, 10], [0, 0, -1])).toBeCloseTo(10, 4)
  })

  it('gives Infinity across a gap wider than the given one: the station is not on a plate', () => {
    expect(plateProbeFromBvhs(bvhs(), 0.2)([60, 30, 10.3], [0, 0, -1])).toBe(Infinity)
  })

  // Off the end of a side flush with another member a ray starts in open air and meets some other part far away.
  it('gives Infinity for a ray that starts in open air and meets a part 100 mm away', () => {
    expect(plateProbeFromBvhs(bvhs(), 0.5)([60, 30, 110], [0, 0, -1])).toBe(Infinity)
  })

  it('still reads a wall whose next surface is a bore written as a body of its own, wider than the gap', () => {
    const wall = cubeTriangles([0, 0, 0], [100, 60, 20])
    const bore = cubeTriangles([10, 10, 4], [80, 40, 12])
    const parts = buildBodyBvhs(buildMeshModel(soupOf([...wall, ...bore]), 1)).map((b) => b.bvh)
    expect(plateProbeFromBvhs(parts, 0.5)([50, 30, 20], [0, 0, -1])).toBeCloseTo(4, 4)
  })

  it('stops at the next surface of any body after it enters, such as a bore written as a body of its own', () => {
    const wall = cubeTriangles([0, 0, 0], [100, 60, 20])
    const bore = cubeTriangles([10, 10, 4], [80, 40, 12])
    const parts = buildBodyBvhs(buildMeshModel(soupOf([...wall, ...bore]), 1)).map((b) => b.bvh)
    expect(plateProbeFromBvhs(parts, 0.5)([50, 30, 20.2], [0, 0, -1])).toBeCloseTo(4, 4)
  })
})

describe('plateProbeFromBvhs on a ray that runs along a plate', () => {
  const parts = (...solids: number[][][]) => buildBodyBvhs(buildMeshModel(soupOf(solids.flat()), 1)).map((b) => b.bvh)
  // A wall 3 mm thick, 100 mm wide, 60 mm long along y: its end face is at y 0.
  const wall = cubeTriangles([0, 0, 0], [100, 60, 3])
  const block = cubeTriangles([200, 200, 200], [10, 10, 10])

  it('gives Infinity for a ray from the cut end of a wall: it has gone along the wall, not through it', () => {
    const probe = plateProbeFromBvhs(parts(wall, block), 1)
    expect(probe([50, 0, 1.5], [0, 1, 0])).toBe(Infinity)
  })

  it('still measures straight through the same wall', () => {
    const probe = plateProbeFromBvhs(parts(wall, block), 1)
    expect(probe([50, 30, 3], [0, 0, -1])).toBeCloseTo(3, 4)
  })

  it('gives Infinity for the length of a bar read from its end, and its diameter across it', () => {
    const bar = cubeTriangles([0, 0, 0], [20, 200, 20])
    const probe = plateProbeFromBvhs(parts(bar, block), 1)
    expect(probe([10, 0, 10], [0, 1, 0])).toBe(Infinity)
    expect(probe([10, 100, 20], [0, 0, -1])).toBeCloseTo(20, 4)
  })

  it('gives Infinity for even a short run along a wall, 8.85 mm in 3.18 mm', () => {
    const stub = cubeTriangles([0, 0, 0], [100, 8.85, 3.18])
    expect(plateProbeFromBvhs(parts(stub, block), 1)([50, 0, 1.59], [0, 1, 0])).toBe(Infinity)
  })

  it('keeps a true wall reading with a narrow width beside it, near the end of a tube', () => {
    const end = cubeTriangles([0, 0, 0], [1.5, 60, 3.2])
    expect(plateProbeFromBvhs(parts(end, block), 1)([0.75, 30, 3.2], [0, 0, -1])).toBeCloseTo(3.2, 4)
  })

  it('keeps a reading beside another body, such as a plate 1 mm from a bar through it', () => {
    const plate = cubeTriangles([0, 0, 0], [150, 150, 10])
    const post = cubeTriangles([60, 60, -40], [30, 30, 90])
    const probe = plateProbeFromBvhs(parts(plate, post), 1)
    expect(probe([59, 75, 10], [0, 0, -1])).toBeCloseTo(10, 4)
  })

  it('leaves the thickness of that plate unknown in a seam along the cut end', () => {
    const points = [0.25, 0.5, 0.75].map((f) => ({ s: f * 100, p: [f * 100, 0, 3] as Vec3, t: [1, 0, 0] as Vec3, n1: [0, -1, 0] as Vec3, n2: [0, 0, 1] as Vec3 }))
    const [endFace] = seamThickness(points, plateProbeFromBvhs(parts(wall, block), 1))
    expect(endFace).toBeNull()
  })
})

describe('probeFromBvhs', () => {
  const bodies = () =>
    buildBodyBvhs(buildMeshModel(soupOf([...cubeTriangles([0, 0, 0], [100, 60, 10]), ...cubeTriangles([20, 10, 10], [10, 40, 40])]), 1))

  it('measures through the material from a surface point', () => {
    const probe = probeFromBvhs(bodies().map((b) => b.bvh))
    expect(probe([60, 30, 10], [0, 0, -1])).toBeCloseTo(10, 4)
    expect(probe([25, 30, 50], [0, 0, -1])).toBeCloseTo(40, 4)
  })

  it('takes the nearest hit over all bodies', () => {
    const probe = probeFromBvhs(bodies().map((b) => b.bvh))
    expect(probe([30, 30, 30], [-1, 0, 0])).toBeCloseTo(10, 4)
  })

  it('returns Infinity when nothing lies behind', () => {
    const probe = probeFromBvhs(bodies().map((b) => b.bvh))
    expect(probe([60, 30, 10], [0, 0, 1])).toBe(Infinity)
    expect(probeFromBvhs([])([0, 0, 0], [0, 0, -1])).toBe(Infinity)
  })
})
