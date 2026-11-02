import { describe, expect, it } from 'vitest'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { StlError } from '../../../src/core/mesh/parseStl'
import { cubeTriangles, soupOf } from '../helpers/shapes'
import { loadSampleModel, loadSoup, transformSoup } from '../helpers/models'
import { readManifest } from '../helpers/samples'

describe('buildMeshModel on the generated samples', () => {
  it.each(readManifest().samples.map((s) => [s.id, s.bodies] as const))(
    '%s has %i bodies and a closed manifold surface',
    (id, bodies) => {
      const model = loadSampleModel(id)
      expect(model.bodies.count).toBe(bodies)
      expect(model.edges.stats.boundary).toBe(0)
      expect(model.edges.stats.nonManifold).toBe(0)
      expect(model.droppedDegenerate).toBe(0)
    },
  )

  it('reorients only the flipped-normals sample and leaves every body signed', () => {
    for (const { id } of readManifest().samples) {
      const { orientation } = loadSampleModel(id)
      expect(orientation.unsignedBodies, id).toEqual([])
      expect(orientation.reorientedBodies, id).toEqual(id === 'flipped-normals' ? [0, 1] : [])
    }
  })

  it('scales the inch sample to 200 mm across when the user answers inch', () => {
    expect(loadSampleModel('t-joint-inch', 'in').bounds.maxDimension).toBeCloseTo(200, 2)
  })

  it('gives the same topology for a part moved 100000 mm from the origin', () => {
    const near = loadSampleModel('t-joint-merged')
    const far = buildMeshModel(transformSoup(loadSoup('t-joint-merged'), { translate: [100000, 100000, 100000] }), 1)
    expect(far.mesh.vertexCount).toBe(near.mesh.vertexCount)
    expect(far.mesh.triangleCount).toBe(near.mesh.triangleCount)
    expect(far.edges.stats).toEqual(near.edges.stats)
    expect(far.bodies.count).toBe(near.bodies.count)
  })
})

describe('buildMeshModel', () => {
  it('applies scaleToMm before measuring, so a 0.2 m cube is 200 mm', () => {
    const model = buildMeshModel(soupOf(cubeTriangles([0, 0, 0], [0.2, 0.1, 0.05])), 1000)
    expect(model.bounds.maxDimension).toBeCloseTo(200, 3)
    expect(model.mesh.vertexCount).toBe(8)
  })

  it('reports dropped degenerate triangles', () => {
    const soup = soupOf([...cubeTriangles([0, 0, 0], [10, 10, 10]), [0, -5, 0, 5, -5, 0, 10, -5, 0]])
    const model = buildMeshModel(soup, 1)
    expect(model.droppedDegenerate).toBe(1)
    expect(model.mesh.triangleCount).toBe(12)
  })

  it('refuses a file whose triangles all collapse, in three parts', () => {
    const soup = soupOf([[1, 1, 1, 1, 1, 1, 1, 1, 1]])
    let error: unknown
    try {
      buildMeshModel(soup, 1)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(StlError)
    const stl = error as StlError
    expect(stl.code).toBe('no-valid-triangles')
    for (const part of [stl.what, stl.why, stl.next]) expect(part.length).toBeGreaterThan(0)
  })

  it('announces the weld stage, then the topology stage, each before its work starts', () => {
    const stages: string[] = []
    const soup = soupOf(cubeTriangles([0, 0, 0], [10, 10, 10]))
    buildMeshModel(soup, 1, (stage) => stages.push(stage))
    expect(stages).toEqual(['weld', 'topology'])
  })

  it('announces only the weld stage when nothing survives welding', () => {
    const stages: string[] = []
    expect(() => buildMeshModel(soupOf([[1, 1, 1, 1, 1, 1, 1, 1, 1]]), 1, (stage) => stages.push(stage))).toThrow(StlError)
    expect(stages).toEqual(['weld'])
  })
})
