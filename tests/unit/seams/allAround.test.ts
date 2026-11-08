import { describe, expect, it } from 'vitest'
import { computeFaceData } from '../../../src/core/mesh/faces'
import { buildMeshModel, type MeshModel } from '../../../src/core/mesh/model'
import { allAroundLoops, withFlush } from '../../../src/core/seams/allAround'
import { buildBodyBvhs } from '../../../src/core/seams/bodyBvh'
import type { Chain } from '../../../src/core/seams/chain'
import { findContactEdges } from '../../../src/core/seams/contact'
import { loadSampleModel } from '../helpers/models'
import { readManifest } from '../helpers/samples'
import { boxTube, cubeTriangles, soupOf } from '../helpers/shapes'

const TURN_BREAK_DEG = 40

function loopsOf(model: MeshModel) {
  const contact = findContactEdges(model, computeFaceData(model.mesh), buildBodyBvhs(model), 30)
  const { edges, flushFrom } = withFlush(contact)
  const loops = allAroundLoops(model, computeFaceData(model.mesh), edges, flushFrom, TURN_BREAK_DEG)
  const p = model.mesh.positions
  const lengthOf = (loop: Chain) =>
    loop.vertices.slice(1).reduce((sum, v, i) => {
      const u = loop.vertices[i]!
      return sum + Math.hypot(p[v * 3]! - p[u * 3]!, p[v * 3 + 1]! - p[u * 3 + 1]!, p[v * 3 + 2]! - p[u * 3 + 2]!)
    }, 0)
  return { loops, flushFrom, lengths: loops.map((l) => Math.round(lengthOf(l) * 100) / 100).sort((a, b) => a - b) }
}

const modelOf = (...solids: number[][][]) => buildMeshModel(soupOf(solids.flat()), 1)
const rail = boxTube(25.4, 25.4, 3.18, 600, (u, v, w) => [w, u, v])
const rung = boxTube(25.4, 25.4, 3.18, 249.2, (u, v, w) => [287.3 + u, 25.4 + w, v])

describe('allAroundLoops', () => {
  it('closes the four sides of a tube end standing on a plate, and its bore, into two loops', () => {
    const plate = cubeTriangles([-100, -100, 0], [200, 200, 10])
    const tube = boxTube(25.4, 25.4, 3.18, 300, (u, v, w) => [u - 12.7, v - 12.7, 10 + w])
    const { loops, lengths } = loopsOf(modelOf(plate, tube))
    expect(lengths).toEqual([76.16, 101.6])
    for (const loop of loops) {
      expect(loop.closed).toBe(true)
      expect(loop.vertices[0]).toBe(loop.vertices[loop.vertices.length - 1])
    }
  })

  it('closes a tube end butting a tube of the same size with its two flush sides', () => {
    const { loops, flushFrom, lengths } = loopsOf(modelOf(rail, rung))
    expect(lengths).toEqual([76.16, 101.6])
    const outer = loops.find((l) => l.edges.some((k) => k >= flushFrom))!
    expect(outer.edges.filter((k) => k >= flushFrom)).toHaveLength(2)
    expect(outer.edges.filter((k) => k < flushFrom)).toHaveLength(2)
  })

  // A flat block lying flush with two sides of a plate has fillets at its two ends; its flush sides are lapped edges.
  it('closes flush sides only round a member that runs away from the surface at least half its narrowest side', () => {
    const plate = cubeTriangles([0, 0, 0], [100, 60, 10])
    expect(loopsOf(modelOf(plate, cubeTriangles([55, 0, 10], [40, 60, 19.9]))).loops).toEqual([])
    expect(loopsOf(modelOf(plate, cubeTriangles([55, 0, 10], [40, 60, 20]))).lengths).toEqual([200])
  })

  it('does not close a loop made only of flush sides: two tubes butted end to end are a butt joint', () => {
    const left = boxTube(25.4, 25.4, 3.18, 300, (u, v, w) => [w, u, v])
    const right = boxTube(25.4, 25.4, 3.18, 300, (u, v, w) => [300 + w, u, v])
    expect(loopsOf(modelOf(left, right)).loops).toEqual([])
  })

  it('does not close the foot of a long web or stiffener: its ends are a plate thickness, not a member end', () => {
    const plate = cubeTriangles([-100, -60, 0], [200, 120, 10])
    expect(loopsOf(modelOf(plate, cubeTriangles([-80, -5, 10], [160, 10, 80]))).loops).toEqual([])
    expect(loopsOf(modelOf(plate, cubeTriangles([-100, -5, 10], [200, 10, 80]))).loops).toEqual([])
  })

  it('closes a rectangle whose short side is a quarter of its long side, and not one under a quarter', () => {
    const plate = cubeTriangles([-100, -100, 0], [200, 200, 10])
    expect(loopsOf(modelOf(plate, cubeTriangles([-40, -10, 10], [80, 20, 50]))).lengths).toEqual([200])
    expect(loopsOf(modelOf(plate, cubeTriangles([-41, -10, 10], [82, 20, 50]))).loops).toEqual([])
  })

  it('finds a new loop only on the tube frame: elsewhere the only one is the coaming ring of the tank, already a closed seam', () => {
    const expected: Record<string, number[]> = {
      // The coaming is a 64-gon of radius 308 mm: 64 chords of 2 x 308 sin(pi / 64).
      'tank-with-manhole': [Math.round(128 * 308 * Math.sin(Math.PI / 64) * 100) / 100],
      // Each of the 6 rung ends: the bore and the outside.
      'tube-frame': [...Array(6).fill(76.16), ...Array(6).fill(101.6)],
    }
    for (const { id } of readManifest().samples) {
      const model = loadSampleModel(id)
      if (model.bodies.count > 1) expect(loopsOf(model).lengths, id).toEqual(expected[id] ?? [])
    }
  })
})
