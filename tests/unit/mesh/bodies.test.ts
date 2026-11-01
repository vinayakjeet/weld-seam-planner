import { describe, expect, it } from 'vitest'
import { labelBodies } from '../../../src/core/mesh/bodies'
import { weldVertices } from '../../../src/core/mesh/weld'
import { cubeTriangles, soupOf } from '../helpers/shapes'

function bodiesOf(tris: number[][]) {
  const { mesh } = weldVertices(soupOf(tris))
  return labelBodies(mesh.indices, mesh.vertexCount)
}

describe('labelBodies', () => {
  it('gives one body for a cube', () => {
    expect(bodiesOf(cubeTriangles([0, 0, 0], [1, 1, 1])).count).toBe(1)
  })

  it('separates two disjoint cubes and labels triangles in order of appearance', () => {
    const bodies = bodiesOf([...cubeTriangles([0, 0, 0], [1, 1, 1]), ...cubeTriangles([5, 0, 0], [1, 1, 1])])
    expect(bodies.count).toBe(2)
    expect(Array.from(bodies.triangleBody.slice(0, 12))).toEqual(new Array(12).fill(0))
    expect(Array.from(bodies.triangleBody.slice(12))).toEqual(new Array(12).fill(1))
  })

  it('keeps two solids in face contact apart while they share no vertex', () => {
    const small = cubeTriangles([1, 0.25, 0.25], [0.5, 0.5, 0.5])
    expect(bodiesOf([...cubeTriangles([0, 0, 0], [1, 1, 1]), ...small]).count).toBe(2)
  })

  it('fuses solids that share a single vertex position', () => {
    const corner = cubeTriangles([1, 1, 1], [1, 1, 1])
    expect(bodiesOf([...cubeTriangles([0, 0, 0], [1, 1, 1]), ...corner]).count).toBe(1)
  })
})
