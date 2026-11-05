import { Mesh, Raycaster, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { buildDisplayGeometry } from '../../../src/ui/viewport/displayGeometry'
import { DEFAULT_DETECT_SETTINGS } from '../../../src/core/seams/detect'
import { createGeometryApi, type DisplayData, type LoadOutcome } from '../../../src/worker/geometry.api'
import { DEFAULT_ARM } from '../../../src/core/snake/arm'
import { readSample } from '../helpers/samples'
import { makeBinaryStl } from '../helpers/stl'
import { loadSoup, transformSoup } from '../helpers/models'
import { shown } from '../helpers/state'

const built = vi.hoisted(() => ({ count: 0 }))

vi.mock('three-mesh-bvh', async (importOriginal) => {
  const original = await importOriginal<typeof import('three-mesh-bvh')>()
  class CountingBvh extends original.MeshBVH {
    constructor(...args: ConstructorParameters<typeof original.MeshBVH>) {
      super(...args)
      built.count++
    }
  }
  return { ...original, MeshBVH: CountingBvh }
})

function ready(outcome: LoadOutcome): DisplayData {
  if (outcome.status !== 'ready') throw new Error(`expected ready, got ${outcome.status}`)
  return outcome.display
}

const isShared = (a: ArrayBufferView) => a.buffer instanceof SharedArrayBuffer

function farJoint(): ArrayBuffer {
  const soup = transformSoup(loadSoup('t-joint-merged'), { translate: [2_000_000, 0, 0] })
  const tris: number[][] = []
  for (let i = 0; i < soup.length; i += 9) tris.push(Array.from(soup.slice(i, i + 9)))
  return makeBinaryStl(tris, 'far')
}

function firstHitDistance(mesh: Mesh, x: number, y: number): number | undefined {
  const raycaster = new Raycaster(new Vector3(x, y, 500), new Vector3(0, 0, -1))
  raycaster.firstHitOnly = true
  return raycaster.intersectObject(mesh)[0]?.distance
}

describe('display BVH shared with the worker', () => {
  it('puts the display arrays and BVH in shared memory when the page is isolated', async () => {
    const display = ready(await createGeometryApi({ shareBuffers: true }).loadStl(readSample('t-joint-merged'), 't.stl', () => {}))
    expect(isShared(display.positions)).toBe(true)
    expect(isShared(display.indices)).toBe(true)
    expect(display.bvh.roots.every((root) => root instanceof SharedArrayBuffer)).toBe(true)
  })

  it('keeps today\'s copies, transferred to the page, when the page is not isolated', async () => {
    const display = ready(await createGeometryApi({ shareBuffers: false }).loadStl(readSample('t-joint-merged'), 't.stl', () => {}))
    expect(isShared(display.positions)).toBe(false)
    expect(isShared(display.indices)).toBe(false)
    expect(display.bvh.roots.some((root) => root instanceof SharedArrayBuffer)).toBe(false)
  })

  it('shares nothing by default where the environment is not cross-origin isolated', async () => {
    expect(globalThis.crossOriginIsolated).not.toBe(true)
    const display = ready(await createGeometryApi().loadStl(readSample('t-joint-merged'), 't.stl', () => {}))
    expect(isShared(display.positions)).toBe(false)
  })

  it('builds no second BVH for detection, access, snapping and reach', async () => {
    const api = createGeometryApi({ shareBuffers: true })
    ready(await api.loadStl(readSample('t-joint-merged'), 't.stl', () => {}))
    built.count = 0
    const detected = await api.detect(DEFAULT_DETECT_SETTINGS, () => {})
    if (detected.status !== 'ok') throw new Error('detect failed')
    const seams = shown(detected.seams)
    expect(seams.every((s) => s.thicknessMm.every((t) => t === 10))).toBe(true)
    expect((await api.access(seams, () => {})).status).toBe('ok')
    expect(await api.snapPreview(seams[0]!.points[0]!.p, 5)).not.toBeNull()
    const port = { id: 'P1', position: [0, 0, 300] as [number, number, number], direction: [0, 0, -1] as [number, number, number], diameterMm: 200 }
    expect((await api.reach(seams.slice(0, 1), [port], DEFAULT_ARM, () => {})).status).toBe('ok')
    expect(built.count).toBe(0)
  })

  it('gives the same seams, ids and thickness as the copy', async () => {
    const run = async (shareBuffers: boolean) => {
      const api = createGeometryApi({ shareBuffers })
      ready(await api.loadStl(readSample('t-joint-merged'), 't.stl', () => {}))
      const outcome = await api.detect(DEFAULT_DETECT_SETTINGS, () => {})
      if (outcome.status !== 'ok') throw new Error('detect failed')
      return outcome.seams
    }
    expect(await run(true)).toEqual(await run(false))
  })

  it('lets the page ray cast through the shared BVH exactly as through a copy', async () => {
    const shared = buildDisplayGeometry(ready(await createGeometryApi({ shareBuffers: true }).loadStl(readSample('t-joint-merged'), 't.stl', () => {})))
    const copy = buildDisplayGeometry(ready(await createGeometryApi({ shareBuffers: false }).loadStl(readSample('t-joint-merged'), 't.stl', () => {})))
    for (const [x, y] of [[0, 40], [0, 0], [0, 200], [30, -45], [-20, 12]] as const) {
      expect(firstHitDistance(new Mesh(shared), x, y), `${x}, ${y}`).toBe(firstHitDistance(new Mesh(copy), x, y))
    }
    expect(firstHitDistance(new Mesh(shared), 0, 40)).toBeCloseTo(490, 3)
    expect(shared.boundsTree).toBeDefined()
  })

  it('falls back to the copy for a part drawn relative to a display origin, whose coordinates differ from the worker\'s', async () => {
    const api = createGeometryApi({ shareBuffers: true })
    const display = ready(await api.loadStl(farJoint(), 'far.stl', () => {}))
    expect(isShared(display.positions)).toBe(false)
    built.count = 0
    const detected = await api.detect(DEFAULT_DETECT_SETTINGS, () => {})
    expect(detected.status).toBe('ok')
    expect(built.count).toBe(1)
  })
})
