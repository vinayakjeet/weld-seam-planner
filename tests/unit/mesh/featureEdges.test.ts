import { describe, expect, it } from 'vitest'
import { computeFaceData } from '../../../src/core/mesh/faces'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { MAX_FEATURE_SEGMENTS, featureEdgePositions } from '../../../src/core/mesh/featureEdges'
import { cubeTriangles, soupOf } from '../helpers/shapes'
import { loadSampleModel } from '../helpers/models'

const edgesOf = (tris: number[][], origin: [number, number, number] = [0, 0, 0], threshold = 30) => {
  const model = buildMeshModel(soupOf(tris), 1)
  return featureEdgePositions(model, computeFaceData(model.mesh), threshold, origin)
}

describe('featureEdgePositions', () => {
  it('gives the 12 edges of a box at a 30 degree threshold, and not the diagonals of its faces', () => {
    const edges = edgesOf(cubeTriangles([0, 0, 0], [10, 20, 30]))
    expect(edges).toBeInstanceOf(Float32Array)
    expect(edges.length).toBe(12 * 6)
  })

  it('keeps the boundary edges of an open sheet and leaves out a nearly flat fold', () => {
    const sheet = [[0, 0, 0, 1, 0, 0, 1, 1, 0], [0, 0, 0, 1, 1, 0, 0, 1, 0.01]]
    expect(edgesOf(sheet).length).toBe(4 * 6)
  })

  it('writes the segments relative to the display origin', () => {
    const edges = edgesOf(cubeTriangles([2_000_000, 0, 0], [10, 20, 30]), [2_000_000, 0, 0])
    const xs = Array.from(edges).filter((_, i) => i % 3 === 0)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.max(...xs)).toBe(10)
  })

  it('finds the outline and creases of a sample', () => {
    const model = loadSampleModel('t-joint-merged')
    const edges = featureEdgePositions(model, computeFaceData(model.mesh), 30, [0, 0, 0])
    // 12 edges of the plate and 12 of the web, two of which are the fillets, and the plate edges under the web split.
    expect(edges.length / 6).toBeGreaterThanOrEqual(22)
  })

  it('draws none for a part with more segments than the cap', () => {
    expect(MAX_FEATURE_SEGMENTS).toBe(500_000)
  })
})
