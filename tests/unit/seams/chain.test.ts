import { describe, expect, it } from 'vitest'
import { computeFaceData } from '../../../src/core/mesh/faces'
import type { MeshModel } from '../../../src/core/mesh/model'
import { chainEdges, edgeEnds, type Chain } from '../../../src/core/seams/chain'
import { extractCreaseEdges } from '../../../src/core/seams/crease'
import { loadSampleModel } from '../helpers/models'

const ends = (...pairs: [number, number][]) => Uint32Array.from(pairs.flat())
const at = (...points: number[][]) => Float32Array.from(points.flat())

function length(positions: Float32Array, chain: Chain): number {
  let sum = 0
  for (let i = 0; i + 1 < chain.vertices.length; i++) {
    const a = chain.vertices[i]! * 3
    const b = chain.vertices[i + 1]! * 3
    sum += Math.hypot(positions[a]! - positions[b]!, positions[a + 1]! - positions[b + 1]!, positions[a + 2]! - positions[b + 2]!)
  }
  return sum
}

function chainsOf(model: MeshModel, creaseAngleDeg = 30): Chain[] {
  const { edgeIds } = extractCreaseEdges(model, computeFaceData(model.mesh), creaseAngleDeg)
  return chainEdges(model.mesh.positions, edgeEnds(model.edges, edgeIds), 40)
}

describe('chainEdges on small graphs', () => {
  it('walks a straight run through degree-2 vertices as one chain, whatever the input order', () => {
    const positions = at([0, 0, 0], [10, 0, 0], [20, 0, 0], [30, 0, 0], [40, 0, 0])
    const chains = chainEdges(positions, ends([3, 4], [1, 0], [2, 1], [3, 2]), 40)
    expect(chains).toEqual([{ vertices: [0, 1, 2, 3, 4], edges: [1, 2, 3, 0], closed: false }])
  })

  it('splits at a degree-3 junction', () => {
    const positions = at([0, 0, 0], [10, 0, 0], [-10, 0, 0], [0, 10, 0])
    const chains = chainEdges(positions, ends([0, 1], [0, 2], [0, 3]), 40)
    expect(chains.map((c) => c.vertices)).toEqual([[0, 1], [0, 2], [0, 3]])
  })

  it.each([
    [30, 1],
    [40, 1],
    [41, 2],
    [90, 2],
  ])('a %i degree turn gives %i chain(s) at the 40 degree limit', (turn, count) => {
    const a = (turn * Math.PI) / 180
    const positions = at([0, 0, 0], [100, 0, 0], [100 + 100 * Math.cos(a), 100 * Math.sin(a), 0])
    expect(chainEdges(positions, ends([0, 1], [1, 2]), 40)).toHaveLength(count)
  })

  it('walks a ring with no junction and no corner as one closed chain from its lowest vertex', () => {
    const n = 96
    const id = (i: number) => (i * 5) % n
    const positions = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n
      positions.set([25 * Math.cos(a), 25 * Math.sin(a), 0], id(i) * 3)
    }
    const input: [number, number][] = []
    for (let i = n - 1; i >= 0; i--) input.push([id((i + 1) % n), id(i)])
    const chains = chainEdges(positions, ends(...input), 40)
    expect(chains).toHaveLength(1)
    const chain = chains[0]!
    expect(chain.closed).toBe(true)
    expect(chain.vertices).toHaveLength(n + 1)
    expect(chain.vertices[0]).toBe(0)
    expect(chain.vertices[n]).toBe(0)
    expect(chain.vertices[1]).toBe(Math.min(id(1), id(n - 1)))
    expect(new Set(chain.edges).size).toBe(n)
  })

  it('splits a square loop into four chains at its 90 degree corners', () => {
    const positions = at([0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0])
    const chains = chainEdges(positions, ends([0, 1], [1, 2], [2, 3], [3, 0]), 40)
    expect(chains).toHaveLength(4)
    expect(chains.every((c) => c.edges.length === 1 && !c.closed)).toBe(true)
  })

  it('returns one closed chain for a loop with a single sharp corner', () => {
    const points: number[][] = []
    for (let i = 0; i <= 10; i++) {
      const a = ((-150 + 30 * i) * Math.PI) / 180
      points.push([10 * Math.cos(a), 10 * Math.sin(a), 0])
    }
    points.push([-20, 0, 0])
    const ring: [number, number][] = []
    for (let i = 0; i < 12; i++) ring.push([i, (i + 1) % 12])
    const chains = chainEdges(at(...points), ends(...ring), 40)
    expect(chains).toHaveLength(1)
    expect(chains[0]!.closed).toBe(true)
    expect(chains[0]!.vertices).toHaveLength(13)
    expect(chains[0]!.vertices[0]).toBe(11)
    expect(chains[0]!.vertices[12]).toBe(11)
  })
})

describe('edgeEnds', () => {
  it('lists the two vertices of each chosen edge in order', () => {
    const model = loadSampleModel('t-joint-merged')
    const result = edgeEnds(model.edges, Uint32Array.from([3, 7]))
    expect(Array.from(result)).toEqual([model.edges.edgeA[3], model.edges.edgeB[3], model.edges.edgeA[7], model.edges.edgeB[7]])
  })
})

describe('chainEdges on the samples', () => {
  it('gives the T-joint two open chains of 200 mm', () => {
    const model = loadSampleModel('t-joint-merged')
    const chains = chainsOf(model)
    expect(chains).toHaveLength(2)
    for (const chain of chains) {
      expect(chain.closed).toBe(false)
      expect(length(model.mesh.positions, chain)).toBeCloseTo(200, 2)
    }
  })

  it('gives the box girder eight open chains of 600 mm', () => {
    const model = loadSampleModel('box-beam')
    const chains = chainsOf(model)
    expect(chains).toHaveLength(8)
    for (const chain of chains) {
      expect(chain.closed).toBe(false)
      expect(length(model.mesh.positions, chain)).toBeCloseTo(600, 2)
    }
  })

  it('gives the pipe an outer and a bore loop, both closed', () => {
    const chains = chainsOf(loadSampleModel('pipe-on-plate'))
    expect(chains).toHaveLength(2)
    expect(chains.every((c) => c.closed)).toBe(true)
  })

  it('splits the gusseted bracket at every gusset and every toe', () => {
    const model = loadSampleModel('l-bracket-gussets')
    const lengths = chainsOf(model, 30).map((c) => Math.round(length(model.mesh.positions, c))).sort((a, b) => a - b)
    expect(lengths).toEqual([...Array(6).fill(8), 20, 20, 28, 28, ...Array(12).fill(50)])
  })
})
