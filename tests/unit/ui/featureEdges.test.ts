import { BoxGeometry, BufferAttribute, BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { EDGE_MAX_TRIANGLES, edgesAllowed, featureEdgePositions } from '../../../src/ui/viewport/featureEdges'

describe('featureEdgePositions', () => {
  it('gives the 12 edges of a box at a 30 degree threshold', () => {
    const edges = featureEdgePositions(new BoxGeometry(10, 20, 30), 30)
    expect(edges).toBeInstanceOf(Float32Array)
    expect(edges.length).toBe(72)
  })

  it('leaves out the shared edges of a nearly flat surface', () => {
    const flat = new BufferGeometry()
    flat.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0.01]), 3))
    flat.setIndex([0, 1, 2, 0, 2, 3])
    // The 2 triangles share the diagonal; only the 4 boundary edges are features.
    expect(featureEdgePositions(flat, 30).length).toBe(4 * 6)
  })
})

describe('edgesAllowed', () => {
  it('allows a part up to the limit and not above it', () => {
    expect(EDGE_MAX_TRIANGLES).toBe(400000)
    expect(edgesAllowed(400000)).toBe(true)
    expect(edgesAllowed(400001)).toBe(false)
  })
})
