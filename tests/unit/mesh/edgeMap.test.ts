import { describe, expect, it } from 'vitest'
import { buildEdgeMap, edgeKey } from '../../../src/core/mesh/edgeMap'
import { weldVertices } from '../../../src/core/mesh/weld'
import { cubeTriangles, soupOf } from '../helpers/shapes'

describe('edgeKey', () => {
  it('is a * N + b with the lower vertex first, in either argument order', () => {
    expect(edgeKey(2, 5, 10)).toBe(25)
    expect(edgeKey(5, 2, 10)).toBe(25)
  })
})

describe('buildEdgeMap', () => {
  it('finds 18 manifold edges on a cube and no boundary', () => {
    const { mesh } = weldVertices(soupOf(cubeTriangles([0, 0, 0], [1, 1, 1])))
    const edges = buildEdgeMap(mesh.indices, mesh.vertexCount)
    expect(edges.edgeCount).toBe(18)
    expect(edges.stats).toEqual({ boundary: 0, manifold: 18, nonManifold: 0 })
    for (let e = 0; e < edges.edgeCount; e++) {
      expect(edges.faceA[e]).toBeGreaterThanOrEqual(0)
      expect(edges.faceB[e]).toBeGreaterThanOrEqual(0)
      expect(edges.faceA[e]).not.toBe(edges.faceB[e])
      expect(edges.edgeA[e]).toBeLessThan(edges.edgeB[e]!)
    }
  })

  it('counts the three edges of a lone triangle as boundary', () => {
    const edges = buildEdgeMap(Uint32Array.from([0, 1, 2]), 3)
    expect(edges.stats).toEqual({ boundary: 3, manifold: 0, nonManifold: 0 })
    expect(edges.faceB[0]).toBe(-1)
  })

  it('flags an edge used by three triangles as non-manifold', () => {
    const edges = buildEdgeMap(Uint32Array.from([0, 1, 2, 0, 1, 3, 1, 0, 4]), 5)
    expect(edges.stats).toEqual({ boundary: 6, manifold: 0, nonManifold: 1 })
    const shared = edges.keyToEdge.get(edgeKey(0, 1, 5))!
    expect(edges.useCount[shared]).toBe(3)
  })
})
