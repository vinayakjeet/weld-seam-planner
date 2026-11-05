import { Group, Mesh, Raycaster, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { displayOrigin } from '../../../src/core/mesh/displayOrigin'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { buildDisplayGeometry } from '../../../src/ui/viewport/displayGeometry'
import { createGeometryApi } from '../../../src/worker/geometry.api'
import { loadSoup, transformSoup } from '../helpers/models'
import { makeBinaryStl } from '../helpers/stl'

// The T-joint as a binary STL moved along x, as a CAD export in plant coordinates would be.
function tJointAt(x: number) {
  const soup = transformSoup(loadSoup('t-joint-merged'), { translate: [x, 0, 0] })
  const tris: number[][] = []
  for (let i = 0; i < soup.length; i += 9) tris.push(Array.from(soup.slice(i, i + 9)))
  return { stl: makeBinaryStl(tris, 'far'), soup }
}

async function loaded(x: number) {
  const { stl, soup } = tJointAt(x)
  const outcome = await createGeometryApi({ shareBuffers: false }).loadStl(stl, 'far.stl', () => {})
  if (outcome.status !== 'ready') throw new Error('expected ready')
  return { ...outcome, model: buildMeshModel(soup, 1) }
}

// Where the scene puts the part: the display mesh inside a group at the display origin (Scene.tsx).
function sceneOf(display: Parameters<typeof buildDisplayGeometry>[0], origin: [number, number, number]) {
  const group = new Group()
  group.position.set(...origin)
  group.add(new Mesh(buildDisplayGeometry(display)))
  group.updateMatrixWorld(true)
  return group
}

function pick(object: Group, x: number, y: number) {
  const raycaster = new Raycaster(new Vector3(x, y, 500), new Vector3(0, 0, -1))
  raycaster.firstHitOnly = true
  return raycaster.intersectObject(object, true)[0]
}

describe('a part 2 km from its origin is drawn relative to a display origin and picked in part coordinates', () => {
  it('puts the display origin at the box centre rounded to the metre', async () => {
    const { part } = await loaded(2_000_000)
    expect(displayOrigin(part.bbox)).toEqual([2_000_000, 0, 0])
  })

  it('stores every display position as the part position minus the display origin, exactly', async () => {
    const { part, display, model } = await loaded(2_000_000)
    const origin = displayOrigin(part.bbox)
    const world = model.mesh.positions
    expect(display.positions.length).toBe(world.length)
    let largest = 0
    for (let i = 0; i < world.length; i++) {
      const local = display.positions[i]!
      expect(local + origin[i % 3]!, `coordinate ${i}`).toBe(world[i])
      largest = Math.max(largest, Math.abs(local))
    }
    // Small numbers, so float32 keeps the detail of a weld: 2 km out it would keep a quarter of a millimetre.
    expect(largest).toBeLessThan(120)
  })

  it('draws the outline relative to the same origin', async () => {
    const { display, part } = await loaded(2_000_000)
    const origin = displayOrigin(part.bbox)
    expect(display.edges.length).toBeGreaterThan(0)
    for (let i = 0; i < display.edges.length; i++) expect(Math.abs(display.edges[i]! + origin[i % 3]! - (i % 3 === 0 ? 2_000_000 : 0))).toBeLessThan(120)
  })

  it('maps a pick on the part back to the part coordinates', async () => {
    const { part, display } = await loaded(2_000_000)
    const scene = sceneOf(display, displayOrigin(part.bbox))
    // The flange top at z 10 and the top of the web at z 90, hit where the ray crosses them.
    const flange = pick(scene, 2_000_000 + 60, 40)!
    expect(flange.point.x).toBeCloseTo(2_000_060, 6)
    expect(flange.point.y).toBeCloseTo(40, 6)
    expect(flange.point.z).toBeCloseTo(10, 6)
    const web = pick(scene, 2_000_000 - 30, 0)!
    expect(web.point.x).toBeCloseTo(1_999_970, 6)
    expect(web.point.z).toBeCloseTo(90, 6)
  })

  it('finds nothing where the part is not, so the group placement is what puts the picture on the part', async () => {
    const { part, display } = await loaded(2_000_000)
    const origin = displayOrigin(part.bbox)
    expect(pick(sceneOf(display, [0, 0, 0]), 2_000_060, 40)).toBeUndefined()
    expect(pick(sceneOf(display, origin), 2_000_060, 40)).toBeDefined()
    expect(pick(sceneOf(display, origin), 2_000_060, 400)).toBeUndefined()
  })

  it('gives the same pick, in its own coordinates, for the same part at the origin', async () => {
    const near = await loaded(0)
    const far = await loaded(2_000_000)
    expect(displayOrigin(near.part.bbox)).toEqual([0, 0, 0])
    const a = pick(sceneOf(near.display, [0, 0, 0]), 60, 40)!
    const b = pick(sceneOf(far.display, displayOrigin(far.part.bbox)), 2_000_060, 40)!
    expect(b.point.x - 2_000_000).toBeCloseTo(a.point.x, 6)
    expect(b.point.y).toBeCloseTo(a.point.y, 6)
    expect(b.point.z).toBeCloseTo(a.point.z, 6)
    expect(b.distance).toBeCloseTo(a.distance, 6)
  })
})
