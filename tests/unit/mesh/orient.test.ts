import { describe, expect, it } from 'vitest'
import { computeFaceData } from '../../../src/core/mesh/faces'
import { buildMeshModel, type MeshModel } from '../../../src/core/mesh/model'
import { orientBodies } from '../../../src/core/mesh/orient'
import { cubeTriangles, soupOf } from '../helpers/shapes'

// Swaps two vertices of a triangle, which reverses its winding.
const reverse = (tri: number[]): number[] => [...tri.slice(0, 3), ...tri.slice(6, 9), ...tri.slice(3, 6)]

function signedVolume(model: MeshModel): number {
  const { positions, indices, triangleCount } = model.mesh
  let sum = 0
  for (let f = 0; f < triangleCount; f++) {
    const [a, b, c] = [0, 1, 2].map((k) => indices[f * 3 + k]! * 3)
    const p = (i: number, c: number) => positions[i + c]!
    sum +=
      p(a!, 0) * (p(b!, 1) * p(c!, 2) - p(b!, 2) * p(c!, 1)) -
      p(a!, 1) * (p(b!, 0) * p(c!, 2) - p(b!, 2) * p(c!, 0)) +
      p(a!, 2) * (p(b!, 0) * p(c!, 1) - p(b!, 1) * p(c!, 0))
  }
  return sum / 6
}

function allOutward(model: MeshModel, centre: number[]): boolean {
  const faces = computeFaceData(model.mesh)
  for (let f = 0; f < model.mesh.triangleCount; f++) {
    const out = [0, 1, 2].reduce((s, c) => s + (faces.centroids[f * 3 + c]! - centre[c]!) * faces.normals[f * 3 + c]!, 0)
    if (out <= 0) return false
  }
  return true
}

const cube = cubeTriangles([0, 0, 0], [10, 10, 10])
const CENTRE = [5, 5, 5]

describe('orientBodies on closed bodies', () => {
  it('leaves a consistent, outward cube alone and returns the same indices', () => {
    const model = buildMeshModel(soupOf(cube), 1)
    expect(model.orientation).toEqual({ reorientedBodies: [], unsignedBodies: [], flippedTriangles: 0 })
    const again = orientBodies(model.mesh, model.bodies, model.edges)
    expect(again.indices).toBe(model.mesh.indices)
  })

  it('flips a cube whose every triangle is reversed', () => {
    const model = buildMeshModel(soupOf(cube.map(reverse)), 1)
    expect(model.orientation.reorientedBodies).toEqual([0])
    expect(model.orientation.unsignedBodies).toEqual([])
    expect(model.orientation.flippedTriangles).toBe(12)
    expect(signedVolume(model)).toBeCloseTo(1000, 3)
    expect(allOutward(model, CENTRE)).toBe(true)
  })

  it('flips back a cube with a single reversed face', () => {
    const tris = cube.map((tri, i) => (i === 4 || i === 5 ? reverse(tri) : tri))
    const model = buildMeshModel(soupOf(tris), 1)
    expect(model.orientation.reorientedBodies).toEqual([0])
    expect(model.orientation.unsignedBodies).toEqual([])
    expect(signedVolume(model)).toBeCloseTo(1000, 3)
    expect(allOutward(model, CENTRE)).toBe(true)
  })

  it('repairs each body on its own', () => {
    const second = cubeTriangles([30, 0, 0], [10, 10, 10]).map(reverse)
    const model = buildMeshModel(soupOf([...cube, ...second]), 1)
    expect(model.bodies.count).toBe(2)
    expect(model.orientation.reorientedBodies).toEqual([1])
    expect(allOutward(model, CENTRE)).toBe(false)
    const faces = computeFaceData(model.mesh)
    for (let f = 12; f < 24; f++) {
      const out = [0, 1, 2].reduce((s, c) => s + (faces.centroids[f * 3 + c]! - [35, 5, 5][c]!) * faces.normals[f * 3 + c]!, 0)
      expect(out).toBeGreaterThan(0)
    }
  })

  it('does not depend on the triangle order within the file', () => {
    const shuffled = [...cube.map(reverse)].reverse()
    const model = buildMeshModel(soupOf(shuffled), 1)
    expect(signedVolume(model)).toBeCloseTo(1000, 3)
    expect(allOutward(model, CENTRE)).toBe(true)
  })
})

describe('orientBodies on bodies without a trustworthy sign', () => {
  // Two 40 mm quads folded 90 degrees along the edge y = 40, z = 0.
  const quad = (a: number[], b: number[], c: number[], d: number[]) => [[...a, ...b, ...c], [...a, ...c, ...d]]
  const flat = quad([0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0])
  const wall = quad([0, 40, 0], [40, 40, 0], [40, 40, 40], [0, 40, 40])

  it('keeps an open sheet unsigned and makes its winding consistent', () => {
    const model = buildMeshModel(soupOf([...flat, ...wall.map(reverse)]), 1)
    expect(model.edges.stats.boundary).toBeGreaterThan(0)
    expect(model.orientation.unsignedBodies).toEqual([0])
    expect(model.orientation.reorientedBodies).toEqual([0])
    expect(model.orientation.flippedTriangles).toBeGreaterThan(0)
  })

  it('leaves an already consistent open sheet untouched but still unsigned', () => {
    const model = buildMeshModel(soupOf([...flat, ...wall]), 1)
    expect(model.orientation).toEqual({ reorientedBodies: [], unsignedBodies: [0], flippedTriangles: 0 })
  })

  it('terminates on three quads sharing one edge and leaves the body unsigned', () => {
    const book = soupOf([...quad([0, 0, 0], [40, 0, 0], [40, 0, 40], [0, 0, 40]), ...quad([0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0]), ...quad([0, 0, 0], [40, 0, 0], [40, -40, 0], [0, -40, 0])])
    const model = buildMeshModel(book, 1)
    expect(model.edges.stats.nonManifold).toBeGreaterThan(0)
    expect(model.orientation.unsignedBodies).toEqual([0])
  })

  it('terminates on a Moebius strip, which cannot be oriented, and flips nothing', () => {
    const n = 8
    const at = (k: number, side: 1 | -1): number[] => {
      const phi = (2 * Math.PI * k) / n
      const d = [Math.cos(phi / 2) * Math.cos(phi), Math.cos(phi / 2) * Math.sin(phi), Math.sin(phi / 2)]
      return [30 * Math.cos(phi) + side * 5 * d[0]!, 30 * Math.sin(phi) + side * 5 * d[1]!, side * 5 * d[2]!]
    }
    const tris: number[][] = []
    for (let k = 0; k < n; k++) {
      tris.push([...at(k, 1), ...at(k, -1), ...at(k + 1, -1)], [...at(k, 1), ...at(k + 1, -1), ...at(k + 1, 1)])
    }
    const model = buildMeshModel(soupOf(tris), 1)
    expect(model.edges.stats.nonManifold).toBe(0)
    expect(model.orientation.unsignedBodies).toEqual([0])
    expect(model.orientation.flippedTriangles).toBe(0)
  })
})
