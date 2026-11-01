import { describe, expect, it } from 'vitest'
import { weldVertices } from '../../../src/core/mesh/weld'
import { cubeTriangles, soupOf } from '../helpers/shapes'

const cube = cubeTriangles([0, 0, 0], [10, 10, 10])

describe('weldVertices', () => {
  it('turns a cube soup into 8 vertices and 12 triangles', () => {
    const { mesh, droppedDegenerate } = weldVertices(soupOf(cube))
    expect(mesh.vertexCount).toBe(8)
    expect(mesh.triangleCount).toBe(12)
    expect(mesh.positions).toHaveLength(24)
    expect(mesh.indices).toHaveLength(36)
    expect(droppedDegenerate).toBe(0)
  })

  describe('tolerance of 1e-5 x the bounding box diagonal', () => {
    const tol = 1e-5 * Math.hypot(100, 100, 100)
    const pair = (offset: number) =>
      soupOf([
        [0, 0, 0, 100, 0, 0, 0, 100, 0],
        [offset, 0, 0, 100, 0, 0, 0, 0, 100],
      ])

    it('welds vertices 0.4 tolerances apart', () => {
      expect(weldVertices(pair(0.4 * tol)).mesh.vertexCount).toBe(4)
    })

    it('keeps vertices 5 tolerances apart', () => {
      expect(weldVertices(pair(5 * tol)).mesh.vertexCount).toBe(5)
    })
  })

  it('drops collinear and collapsed triangles and leaves no orphan vertices', () => {
    const soup = soupOf([...cube, [0, -5, 0, 5, -5, 0, 10, -5, 0], [20, 20, 20, 20, 20, 20, 30, 30, 30]])
    const { mesh, droppedDegenerate } = weldVertices(soup)
    expect(droppedDegenerate).toBe(2)
    expect(mesh.triangleCount).toBe(12)
    expect(mesh.vertexCount).toBe(8)
  })

  it('keeps a thin sliver that is taller than the tolerance', () => {
    const sliver = [0, 0, 0, 100, 0, 0, 50, 0.01, 0]
    expect(weldVertices(soupOf([sliver])).mesh.triangleCount).toBe(1)
  })

  it('welds a cube placed 100000 mm from the origin', () => {
    const far = cubeTriangles([100000, 100000, 100000], [10, 10, 10])
    expect(weldVertices(soupOf(far)).mesh.vertexCount).toBe(8)
  })

  it('returns an empty mesh when every triangle collapses', () => {
    const { mesh, droppedDegenerate } = weldVertices(soupOf([[1, 1, 1, 1, 1, 1, 1, 1, 1]]))
    expect(mesh.triangleCount).toBe(0)
    expect(droppedDegenerate).toBe(1)
  })
})
