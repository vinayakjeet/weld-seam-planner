import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../../../src/core/math/vec3'
import { SEQUENCE_STRATEGIES, type EdgeCost, type SequenceNode, type Visit } from '../../../src/core/sequence/types'
import { balancedEdge } from '../../../src/core/sequence/balance'
import { optimiseByRecosting } from '../helpers/tspReference'
import { airEdge, airLengthMm, optimise, tourCost } from '../../../src/core/sequence/tsp'
import { exactOptimum } from '../helpers/exact'
import { seededRandom } from '../helpers/random'

const HOME: Vec3 = [0, 0, 500]
const edge = airEdge(HOME, 0)

function node(id: string, a: Vec3, b: Vec3, options: { closed?: boolean; locked?: boolean } = {}): SequenceNode {
  return {
    id,
    closed: options.closed ?? false,
    locked: options.locked ?? false,
    mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    enter: { forward: a, reverse: options.closed ? a : b },
    leave: { forward: b, reverse: options.closed ? a : a },
    arcStart: { forward: a, reverse: options.closed ? a : b },
    arcEnd: { forward: b, reverse: options.closed ? a : a },
  }
}

// Short seams on a coarse grid, along x or y, in a random direction.
function grid(count: number, seed: number): SequenceNode[] {
  const random = seededRandom(seed)
  return Array.from({ length: count }, (_, i) => {
    const x = Math.floor(random() * 9) * 100
    const y = Math.floor(random() * 9) * 100
    const along = random() < 0.5
    const a: Vec3 = [x, y, 0]
    const b: Vec3 = along ? [x + 40, y, 0] : [x, y + 40, 0]
    return random() < 0.5 ? node(`s${i}`, a, b) : node(`s${i}`, b, a)
  })
}

const tableOrder = (nodes: SequenceNode[]): Visit[] => nodes.map((n) => ({ node: n, reversed: false }))
const ids = (tour: Visit[]) => tour.map((v) => v.node.id)

describe('strategies', () => {
  it('lists the four strategies once', () => {
    expect(SEQUENCE_STRATEGIES).toEqual(['table-order', 'min-air-move', 'balanced-heat', 'manual'])
  })
})

describe('optimise', () => {
  it('is never worse than table order on random grids', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const nodes = grid(30, seed)
      const result = optimise(nodes, edge)
      expect(ids(result).slice().sort()).toEqual(nodes.map((n) => n.id).sort())
      expect(tourCost(result, edge)).toBeLessThanOrEqual(tourCost(tableOrder(nodes), edge) + 1e-9)
    }
  })

  it('is within 10 percent of the exact optimum for 8 seams', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const nodes = grid(8, 100 + seed)
      const exact = exactOptimum(nodes, edge)
      expect(tourCost(optimise(nodes, edge), edge)).toBeLessThanOrEqual(exact * 1.1 + 1e-9)
    }
  })

  it('enters a seam from the end nearer to where the torch is', () => {
    const near = node('a', [0, 0, 0], [100, 0, 0])
    const result = optimise([near], airEdge([100, 0, 0], 0))
    expect(result).toEqual([{ node: near, reversed: true }])
  })

  it('keeps a locked seam at its slot and direction while the others move', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const nodes = grid(12, 200 + seed).map((n, i) => (i === 3 || i === 7 ? { ...n, locked: true } : n))
      const start = tableOrder(nodes).map((v, i) => (i === 7 ? { ...v, reversed: true } : v))
      const result = optimise(nodes, edge, { start })
      expect(result[3]).toEqual(start[3])
      expect(result[7]).toEqual(start[7])
      expect(ids(result).slice().sort()).toEqual(nodes.map((n) => n.id).sort())
    }
  })

  it('returns the input when every seam is locked', () => {
    const nodes = grid(5, 7).map((n) => ({ ...n, locked: true }))
    expect(optimise(nodes, edge)).toEqual(tableOrder(nodes))
  })

  it('handles no seams and one seam', () => {
    expect(optimise([], edge)).toEqual([])
    expect(optimise([node('only', [1, 2, 3], [4, 5, 6])], edge)).toHaveLength(1)
    expect(tourCost([], edge)).toBe(0)
  })

  it('never marks a closed loop reversed', () => {
    const nodes = [...grid(6, 3), node('loop', [300, 300, 0], [300, 300, 0], { closed: true })]
    expect(optimise(nodes, edge).every((v) => !v.node.closed || !v.reversed)).toBe(true)
  })

  it('returns a valid tour no worse than table order when the time box is already spent', () => {
    const nodes = grid(40, 11)
    let t = 0
    const result = optimise(nodes, edge, { timeBoxMs: 50, now: () => (t += 100) })
    expect(ids(result).slice().sort()).toEqual(nodes.map((n) => n.id).sort())
    expect(tourCost(result, edge)).toBeLessThanOrEqual(tourCost(tableOrder(nodes), edge) + 1e-9)
  })

  it('gives the same tour for the same input', () => {
    const nodes = grid(25, 5)
    expect(optimise(nodes, edge)).toEqual(optimise(nodes, edge))
  })
})

describe('airLengthMm', () => {
  it('adds the lead twice between seams and once at home', () => {
    const a = node('a', [0, 0, 0], [10, 0, 0])
    const b = node('b', [20, 0, 0], [30, 0, 0])
    const tour: Visit[] = [{ node: a, reversed: false }, { node: b, reversed: false }]
    const home: Vec3 = [0, 0, 0]
    // home to a: 0 + lead; a to b: lead + 10 + lead; b to home: lead + 30
    expect(airLengthMm(tour, home, 50)).toBe(50 + (50 + 10 + 50) + (50 + 30))
  })
})

describe('optimise progress', () => {
  const run = (nodes: SequenceNode[], extra: { locked?: string[] } = {}) => {
    const fractions: number[] = []
    const tour = optimise(
      nodes.map((n) => ({ ...n, locked: extra.locked?.includes(n.id) ?? false })),
      edge,
      { onProgress: (fraction) => fractions.push(fraction) },
    )
    return { fractions, tour }
  }

  it('reports fractions in 0 to 1 that never go back, and ends at 1', () => {
    const { fractions } = run(grid(60, 7))
    expect(fractions.length).toBeGreaterThan(5)
    for (const f of fractions) {
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(1)
    }
    for (let i = 1; i < fractions.length; i++) expect(fractions[i]!).toBeGreaterThanOrEqual(fractions[i - 1]!)
    expect(fractions[fractions.length - 1]).toBe(1)
  })

  it('reports while the nearest neighbour order is built, which is the part that grows with the square of the seam count', () => {
    const { fractions } = run(grid(200, 3))
    // A fraction below 0.8 can only come from the construction.
    expect(fractions.filter((f) => f > 0 && f < 0.8).length).toBeGreaterThan(10)
  })

  it('reports no more often than a few hundred times, however many seams there are', () => {
    const { fractions } = run(grid(400, 5))
    expect(fractions.length).toBeLessThan(300)
  })

  it('does not change the answer', () => {
    const nodes = grid(40, 11)
    // A clock that never moves, so that neither run is cut short by the time box.
    const plain = optimise(nodes, edge, { now: () => 0 })
    const reported = optimise(nodes, edge, { now: () => 0, onProgress: () => undefined })
    expect(ids(reported)).toEqual(ids(plain))
  })

  it('reports 1 for an order with nothing free to place', () => {
    const nodes = grid(3, 1)
    const { fractions } = run(nodes, { locked: nodes.map((n) => n.id) })
    expect(fractions[fractions.length - 1]).toBe(1)
  })
})

describe('optimise prices a candidate from the edges it changes', () => {
  const shuffled = (nodes: SequenceNode[], seed: number): Visit[] => {
    const random = seededRandom(seed)
    const order = nodes.map((node) => ({ node, reversed: !node.closed && random() < 0.5 }))
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[order[i], order[j]] = [order[j]!, order[i]!]
    }
    return order
  }
  const withLocks = (nodes: SequenceNode[], seed: number, share: number) => {
    const random = seededRandom(seed)
    return nodes.map((n) => ({ ...n, locked: random() < share }))
  }
  const counted = (cost: EdgeCost) => {
    const counter = { calls: 0 }
    const edgeCost: EdgeCost = (a, b) => (counter.calls++, cost(a, b))
    return { counter, edgeCost }
  }
  // A clock that never moves lets both searches run to their local optimum.
  const still = { timeBoxMs: 1, now: () => 0 }

  it('walks the same path to the same tour as recosting every candidate, with locked seams and either edge cost', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const random = seededRandom(1000 + seed)
      const nodes = withLocks(grid(2 + Math.floor(random() * 22), seed), seed + 7, seed % 3 === 0 ? 0 : 0.25)
      const start = shuffled(nodes, seed + 11)
      for (const cost of [airEdge(HOME, 15), balancedEdge(nodes, HOME, 15)]) {
        const fast = optimise(nodes, cost, { ...still, start })
        const slow = optimiseByRecosting(nodes, cost, { ...still, start })
        expect(fast.map((v) => [v.node.id, v.reversed]), `seed ${seed}`).toEqual(slow.map((v) => [v.node.id, v.reversed]))
      }
    }
  }, 120_000)

  it('calls the edge cost a small share as often as recosting on 60 seams', () => {
    const nodes = withLocks(grid(60, 5), 3, 0.05)
    const start = shuffled(nodes, 9)
    const fast = counted(airEdge(HOME, 15))
    const slow = counted(airEdge(HOME, 15))
    const a = optimise(nodes, fast.edgeCost, { ...still, start })
    const b = optimiseByRecosting(nodes, slow.edgeCost, { ...still, start })
    expect(ids(a)).toEqual(ids(b))
    expect(fast.counter.calls * 8).toBeLessThan(slow.counter.calls)
  }, 60_000)
})
