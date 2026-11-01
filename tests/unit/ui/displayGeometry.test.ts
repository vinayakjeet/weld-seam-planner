import { Mesh, Raycaster, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { buildDisplayGeometry } from '../../../src/ui/viewport/displayGeometry'
import { createGeometryApi } from '../../../src/worker/geometry.api'
import { readSample } from '../helpers/samples'

async function tJointDisplay() {
  const outcome = await createGeometryApi().loadStl(readSample('t-joint-merged'), 't.stl', () => {})
  if (outcome.status !== 'ready') throw new Error('expected ready')
  return outcome.display
}

function firstHitDistance(mesh: Mesh, x: number, y: number): number | undefined {
  const raycaster = new Raycaster(new Vector3(x, y, 500), new Vector3(0, 0, -1))
  raycaster.firstHitOnly = true
  return raycaster.intersectObject(mesh)[0]?.distance
}

describe('buildDisplayGeometry', () => {
  it('keeps the worker arrays as they are, so no second copy of the part is made', async () => {
    const display = await tJointDisplay()
    const geometry = buildDisplayGeometry(display)
    expect(geometry.getAttribute('position').array).toBe(display.positions)
    expect(geometry.getIndex()!.array).toBe(display.indices)
    expect(geometry.getAttribute('position').count).toBe(display.positions.length / 3)
  })

  it('attaches the serialised BVH, so a Mesh built from it ray casts through the tree', async () => {
    const geometry = buildDisplayGeometry(await tJointDisplay())
    expect(geometry.boundsTree).toBeDefined()
    const mesh = new Mesh(geometry)
    expect(firstHitDistance(mesh, 0, 40)).toBeCloseTo(500 - 10, 3)
    expect(firstHitDistance(mesh, 0, 0)).toBeCloseTo(500 - 90, 3)
    expect(firstHitDistance(mesh, 0, 200)).toBeUndefined()
  })

  it('computes a bounding sphere so the part is not culled when it is drawn', async () => {
    const geometry = buildDisplayGeometry(await tJointDisplay())
    expect(geometry.boundingSphere).not.toBeNull()
    expect(geometry.boundingSphere!.radius).toBeGreaterThan(100)
  })
})
