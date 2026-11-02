import { describe, expect, it } from 'vitest'
import { meshWarnings, type MeshHealth } from '../../../src/core/mesh/health'
import { loadSampleModel } from '../helpers/models'
import { readManifest } from '../helpers/samples'

const clean: MeshHealth = { boundaryEdges: 0, nonManifoldEdges: 0, reorientedBodies: 0, unsignedBodies: 0 }
const codes = (health: Partial<MeshHealth>) => meshWarnings({ ...clean, ...health }).map((w) => w.code)

describe('meshWarnings', () => {
  it('has nothing to say about a clean mesh', () => {
    expect(meshWarnings(clean)).toEqual([])
  })

  it('maps each condition to its own warning', () => {
    expect(codes({ boundaryEdges: 12 })).toEqual(['open-mesh'])
    expect(codes({ nonManifoldEdges: 3 })).toEqual(['non-manifold'])
    expect(codes({ reorientedBodies: 2 })).toEqual(['reoriented'])
    expect(codes({ unsignedBodies: 1 })).toEqual(['concavity-unknown'])
    expect(codes({ boundaryEdges: 1, nonManifoldEdges: 1, reorientedBodies: 1, unsignedBodies: 1 })).toEqual([
      'open-mesh',
      'non-manifold',
      'reoriented',
      'concavity-unknown',
    ])
  })

  it('treats a repaired winding as information and the rest as warnings', () => {
    const all = meshWarnings({ boundaryEdges: 1, nonManifoldEdges: 1, reorientedBodies: 1, unsignedBodies: 1 })
    expect(all.map((w) => [w.code, w.severity])).toEqual([
      ['open-mesh', 'warn'],
      ['non-manifold', 'warn'],
      ['reoriented', 'info'],
      ['concavity-unknown', 'warn'],
    ])
  })

  it('puts the counts in the text and agrees in number', () => {
    expect(meshWarnings({ ...clean, boundaryEdges: 12 })[0]!.what).toContain('12 boundary edges')
    expect(meshWarnings({ ...clean, boundaryEdges: 1 })[0]!.what).toContain('1 boundary edge ')
    expect(meshWarnings({ ...clean, reorientedBodies: 1 })[0]!.what).toContain('1 body')
    expect(meshWarnings({ ...clean, reorientedBodies: 2 })[0]!.what).toContain('2 bodies')
  })

  it('says what happened, why and what to do next, without dashes', () => {
    const all = meshWarnings({ boundaryEdges: 5, nonManifoldEdges: 5, reorientedBodies: 5, unsignedBodies: 5 })
    for (const warning of all) {
      for (const part of [warning.what, warning.why, warning.next]) {
        expect(part.trim().length, warning.code).toBeGreaterThan(20)
        expect(part, warning.code).not.toMatch(/[\u2013\u2014]/)
      }
    }
  })

  it('warns about nothing on the samples except the repaired winding of flipped-normals', () => {
    for (const { id } of readManifest().samples) {
      const model = loadSampleModel(id)
      const found = meshWarnings({
        boundaryEdges: model.edges.stats.boundary,
        nonManifoldEdges: model.edges.stats.nonManifold,
        reorientedBodies: model.orientation.reorientedBodies.length,
        unsignedBodies: model.orientation.unsignedBodies.length,
      }).map((w) => w.code)
      expect(found, id).toEqual(id === 'flipped-normals' ? ['reoriented'] : [])
    }
  })
})
