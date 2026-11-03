import { describe, expect, it } from 'vitest'
import { homePoint } from '../../../src/core/job/build'
import { dot, length, sub, type Vec3 } from '../../../src/core/math/vec3'
import { BALANCE, balancedEdge, principalAxes } from '../../../src/core/sequence/balance'
import { nodesFromPlan } from '../../../src/core/sequence/nodes'
import { airEdge, optimise, tourCost } from '../../../src/core/sequence/tsp'
import type { SequenceNode, Visit } from '../../../src/core/sequence/types'
import { samplePlan } from '../helpers/jobs'

const HOME: Vec3 = [0, 0, 500]
const NONE = { proximityWeight: 0, sameSideMm: 0, centreOutWeight: 0, endOverlapPenaltyMm: 0 }

// A short seam from a to b; both directions are given sensible torch points.
function seam(id: string, a: Vec3, b: Vec3, closed = false): SequenceNode {
  return {
    id,
    closed,
    locked: false,
    mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    enter: { forward: a, reverse: b },
    leave: { forward: b, reverse: a },
    arcStart: { forward: a, reverse: b },
    arcEnd: { forward: b, reverse: a },
  }
}
const at = (id: string, x: number, y: number, z = 0) => seam(id, [x - 5, y, z], [x + 5, y, z])
const forward = (node: SequenceNode): Visit => ({ node, reversed: false })

// What the balanced edge adds on top of the plain air move.
function extra(nodes: SequenceNode[], params: Partial<typeof BALANCE>, from: SequenceNode, to: SequenceNode): number {
  const balanced = balancedEdge(nodes, HOME, 0, params)
  return balanced(forward(from), forward(to)) - airEdge(HOME, 0)(forward(from), forward(to))
}

describe('BALANCE', () => {
  it('uses the spec radius of 300 mm', () => {
    expect(BALANCE.proximityRadiusMm).toBe(300)
  })
})

describe('principalAxes', () => {
  it('puts the axis of a spread along x first, with a centre at the mean', () => {
    const { centre, axes } = principalAxes([[-100, 0, 0], [0, 5, 0], [100, -5, 0], [300, 0, 2]])
    expect(Math.abs(dot(axes[0], [1, 0, 0]))).toBeGreaterThan(0.99)
    expect(centre[0]).toBeCloseTo(75, 6)
  })

  it('follows a diagonal spread', () => {
    const { axes } = principalAxes([[0, 0, 0], [100, 100, 0], [200, 200, 0], [300, 300, 1]])
    expect(Math.abs(dot(axes[0], [Math.SQRT1_2, Math.SQRT1_2, 0]))).toBeGreaterThan(0.99)
  })

  it('returns three orthonormal axes', () => {
    const { axes } = principalAxes([[0, 0, 0], [100, 30, 5], [50, 90, 40], [-20, 10, 70], [30, -60, 10]])
    for (let i = 0; i < 3; i++) {
      expect(length(axes[i]!)).toBeCloseTo(1, 6)
      for (let j = i + 1; j < 3; j++) expect(Math.abs(dot(axes[i]!, axes[j]!))).toBeLessThan(1e-6)
    }
  })

  it('does not fail on one point or on none', () => {
    expect(principalAxes([[1, 2, 3]]).axes).toHaveLength(3)
    expect(principalAxes([]).axes).toHaveLength(3)
  })
})

describe('balancedEdge', () => {
  it('adds a penalty only for consecutive seams closer than R', () => {
    const a = at('a', 0, 0)
    const near = at('near', 100, 0)
    const edge = at('edge', 300, 0)
    const far = at('far', 400, 0)
    const nodes = [a, near, edge, far]
    const only = { ...NONE, proximityWeight: BALANCE.proximityWeight }
    expect(extra(nodes, only, a, near)).toBeCloseTo(BALANCE.proximityWeight * 200, 6)
    expect(extra(nodes, only, a, edge)).toBe(0)
    expect(extra(nodes, only, a, far)).toBe(0)
  })

  it('charges seams on the same side of the part more than seams on opposite sides', () => {
    // Spread along x, with two rows in y, so the principal axes are x and y.
    const [a, b, c, d] = [at('a', -300, 100), at('b', -200, 100), at('c', 300, 100), at('d', 200, 100)]
    const [e, f] = [at('e', -300, -100), at('f', 300, -100)]
    const nodes = [a, b, c, d, e, f]
    const only = { ...NONE, sameSideMm: 150 }
    expect(extra(nodes, only, a, b)).toBe(150)
    expect(extra(nodes, only, a, c)).toBe(0)
    expect(extra(nodes, only, a, e)).toBe(0)
  })

  it('charges for stepping toward the centre and not for stepping out', () => {
    const [outerL, innerL, innerR, outerR] = [at('oL', -400, 0), at('iL', -100, 0), at('iR', 100, 0), at('oR', 400, 0)]
    const only = { ...NONE, centreOutWeight: 0.5 }
    const nodes = [outerL, innerL, innerR, outerR]
    expect(extra(nodes, only, outerL, innerL)).toBeCloseTo(0.5 * 300, 6)
    expect(extra(nodes, only, innerL, outerL)).toBe(0)
  })

  it('charges a large penalty for starting within 10 mm of the previous weld end', () => {
    const a = seam('a', [0, 0, 0], [100, 0, 0])
    const onTop = seam('b', [105, 0, 0], [200, 0, 0])
    const clear = seam('c', [180, 0, 0], [260, 0, 0])
    const only = { ...NONE, endOverlapPenaltyMm: BALANCE.endOverlapPenaltyMm }
    expect(extra([a, onTop, clear], only, a, onTop)).toBe(BALANCE.endOverlapPenaltyMm)
    expect(extra([a, onTop, clear], only, a, clear)).toBe(0)
  })

  it('equals the plain air move when no penalty applies', () => {
    const a = at('a', -400, 0)
    const b = at('b', 400, 500)
    expect(extra([a, b], BALANCE, a, b)).toBeCloseTo(0, 6)
  })

  it('makes the optimiser flip a seam rather than start on the previous weld end', () => {
    const first = seam('first', [0, 0, 0], [100, 0, 0])
    const second = seam('second', [100, 0, 0], [100, 120, 0])
    const nodes = [first, second]
    const tour = optimise(nodes, balancedEdge(nodes, HOME, 0), { timeBoxMs: 1000 })
    for (let i = 1; i < tour.length; i++) {
      const prev = tour[i - 1]!
      const next = tour[i]!
      const end = prev.reversed ? prev.node.arcEnd.reverse : prev.node.arcEnd.forward
      const start = next.reversed ? next.node.arcStart.reverse : next.node.arcStart.forward
      expect(length(sub(end, start))).toBeGreaterThan(BALANCE.endOverlapMm)
    }
  })
})

describe('balanced heat on double-bottom-cell', () => {
  const plan = samplePlan('double-bottom-cell')
  const nodes = nodesFromPlan(plan, new Set())
  const home = homePoint(plan)
  const lead = plan.settings.approachMm
  const spacing = (tour: Visit[]) => {
    let total = 0
    for (let i = 1; i < tour.length; i++) total += length(sub(tour[i - 1]!.node.mid, tour[i]!.node.mid))
    return total / (tour.length - 1)
  }
  const minAir = optimise(nodes, airEdge(home, lead), { timeBoxMs: 2000 })
  const balancedEdgeCost = balancedEdge(nodes, home, lead)
  const balanced = optimise(nodes, balancedEdgeCost, { timeBoxMs: 2000 })

  it('visits every seam once', () => {
    expect(balanced.map((v) => v.node.id).sort()).toEqual(nodes.map((n) => n.id).sort())
  })

  it('puts consecutive seams on average farther apart than minimum air travel does', () => {
    expect(spacing(balanced)).toBeGreaterThan(spacing(minAir) * 1.5)
  })

  it('is never costlier than table order under its own cost', () => {
    expect(tourCost(balanced, balancedEdgeCost)).toBeLessThanOrEqual(tourCost(nodes.map(forward), balancedEdgeCost))
  })
})

describe('edge cases', () => {
  it('orders zero and one seam', () => {
    expect(optimise([], balancedEdge([], HOME, 0))).toEqual([])
    const only = [at('only', 10, 10)]
    expect(optimise(only, balancedEdge(only, HOME, 0))).toHaveLength(1)
  })
})
