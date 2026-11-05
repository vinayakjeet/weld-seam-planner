import { describe, expect, it } from 'vitest'
import { DEFAULT_WELD_TOLERANCE, WELD_TOLERANCE_RANGE, weldVertices } from '../../../src/core/mesh/weld'
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

describe('weld tolerance as a parameter', () => {
  const diagonal = Math.hypot(100, 100, 100)
  const pair = (offset: number) =>
    soupOf([
      [0, 0, 0, 100, 0, 0, 0, 100, 0],
      [offset, 0, 0, 100, 0, 0, 0, 0, 100],
    ])

  it('defaults to 1e-5 of the diagonal and ranges from 1e-6 to 1e-3', () => {
    expect(DEFAULT_WELD_TOLERANCE).toBe(1e-5)
    expect(WELD_TOLERANCE_RANGE).toEqual({ min: 1e-6, max: 1e-3 })
  })

  it('welds vertices further apart as the tolerance is raised', () => {
    const offset = 5e-4 * diagonal * 0.3
    expect(weldVertices(pair(offset)).mesh.vertexCount).toBe(5)
    expect(weldVertices(pair(offset), 5e-4).mesh.vertexCount).toBe(4)
  })

  it('drops a line-thin triangle at any tolerance, and keeps a needle that only the raised tolerance calls thin', () => {
    const line = [10, 10, 100, 60, 10, 100, 35, 10.0001, 100]
    const needle = [10, 10, 100, 60, 10, 100, 35, 10.05, 100]
    const cube100 = cubeTriangles([0, 0, 0], [100, 100, 100])
    expect(weldVertices(soupOf([...cube100, line]), 5e-4).droppedDegenerate).toBe(1)
    expect(weldVertices(soupOf([...cube100, needle]), 5e-4).droppedDegenerate).toBe(0)
  })

  it('records the weld cell in mm on the mesh', () => {
    expect(weldVertices(soupOf(cubeTriangles([0, 0, 0], [100, 100, 100])), 5e-4).mesh.toleranceMm).toBeCloseTo(5e-4 * Math.hypot(100, 100, 100), 9)
  })

  it('welds the same cube at the smallest tolerance, where the cell count is too large to pack into one number', () => {
    const { mesh } = weldVertices(soupOf(cubeTriangles([0, 0, 0], [100, 100, 100])), WELD_TOLERANCE_RANGE.min)
    expect(mesh.vertexCount).toBe(8)
    expect(mesh.triangleCount).toBe(12)
  })

  it('welds the same at the largest tolerance a cube of 100 mm allows without collapsing it', () => {
    const { mesh } = weldVertices(soupOf(cubeTriangles([0, 0, 0], [100, 100, 100])), WELD_TOLERANCE_RANGE.max)
    expect(mesh.vertexCount).toBe(8)
  })
})
