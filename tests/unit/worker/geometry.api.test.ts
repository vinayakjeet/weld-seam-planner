import * as Comlink from 'comlink'
import { BufferAttribute, BufferGeometry, DoubleSide, Ray, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { wrapGeometryApi } from '../../../src/worker/client'
import {
  createGeometryApi,
  type DisplayData,
  type LoadOutcome,
  type PartInfo,
  type UserError,
} from '../../../src/worker/geometry.api'
import { DEFAULT_DETECT_SETTINGS } from '../../../src/core/seams/detect'
import { shown } from '../helpers/state'
import { readSample } from '../helpers/samples'
import { makeBinaryStl, TRIANGLES } from '../helpers/stl'

type Stage = 'read' | 'weld' | 'topology' | 'index' | 'contact' | 'detect'

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

function recorder() {
  const events: Array<[Stage, number]> = []
  return { events, onProgress: (stage: Stage, fraction: number) => void events.push([stage, fraction]) }
}

function ready(outcome: LoadOutcome): { part: PartInfo; display: DisplayData } {
  if (outcome.status !== 'ready') throw new Error(`expected ready, got ${JSON.stringify(outcome).slice(0, 200)}`)
  return outcome
}

function expectUserError(error: UserError) {
  for (const part of [error.what, error.why, error.next]) expect(part.trim().length).toBeGreaterThan(0)
}

function rebuild(display: DisplayData) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(display.positions, 3))
  geometry.setIndex(new BufferAttribute(display.indices, 1))
  return MeshBVH.deserialize(display.bvh, geometry, { setIndex: false })
}

function zHitAt(display: DisplayData, x: number, y: number): number | undefined {
  const hit = rebuild(display).raycastFirst(new Ray(new Vector3(x, y, 200), new Vector3(0, 0, -1)), DoubleSide)
  return hit?.point.z
}

describe('geometry api: loading', () => {
  it('loads t-joint-merged as one body and reports progress that rises to 1', async () => {
    const api = createGeometryApi()
    const { events, onProgress } = recorder()
    const { part } = ready(await api.loadStl(readSample('t-joint-merged'), 't-joint-merged.stl', onProgress))
    expect(part.name).toBe('t-joint-merged.stl')
    expect(part.bodies).toBe(1)
    expect(part.sourceUnits).toBe('mm')
    expect(part.scaleToMm).toBe(1)
    expect(part.boundaryEdges).toBe(0)
    expect(part.nonManifoldEdges).toBe(0)
    const fractions = events.map(([, f]) => f)
    expect(fractions.length).toBeGreaterThanOrEqual(4)
    expect(fractions[fractions.length - 1]).toBe(1)
    for (let i = 1; i < fractions.length; i++) expect(fractions[i]).toBeGreaterThanOrEqual(fractions[i - 1]!)
    expect(fractions[0]).toBeLessThan(0.2)
  })

  it('sends a bounded number of progress events however many triangles the BVH build visits', async () => {
    const tris: number[][] = []
    for (let i = 0; i < 120; i++) {
      for (let j = 0; j < 120; j++) tris.push([i, j, 0, i + 1, j, 0, i + 1, j + 1, 0], [i, j, 0, i + 1, j + 1, 0, i, j + 1, 0])
    }
    const { events, onProgress } = recorder()
    ready(await createGeometryApi().loadStl(makeBinaryStl(tris), 'grid.stl', onProgress))
    expect(events.length).toBeGreaterThanOrEqual(4)
    expect(events.length).toBeLessThanOrEqual(150)
    expect(events[events.length - 1]![1]).toBe(1)
  })

  it('reports the four load stages in order', async () => {
    const { events, onProgress } = recorder()
    await createGeometryApi().loadStl(readSample('t-joint-merged'), 'a.stl', onProgress)
    const order: Stage[] = []
    for (const [stage] of events) if (order[order.length - 1] !== stage) order.push(stage)
    expect(order).toEqual(['read', 'weld', 'topology', 'index'])
  })

  it('serialises a display BVH that rebuilds on the main thread and hits the plate', async () => {
    const { part, display } = ready(await createGeometryApi().loadStl(readSample('t-joint-merged'), 'a.stl', () => {}))
    expect(display.indices.length).toBe(part.triangles * 3)
    expect(display.positions.length % 3).toBe(0)
    expect(zHitAt(display, 0, 40)).toBeCloseTo(10, 3)
    expect(zHitAt(display, 0, 0)).toBeCloseTo(90, 3)
    expect(zHitAt(display, 0, 200)).toBeUndefined()
  })

  it('asks for units on the inch sample, then loads it at 200 mm after the answer', async () => {
    const api = createGeometryApi()
    const asked = await api.loadStl(readSample('t-joint-inch'), 'inch.stl', () => {})
    expect(asked.status).toBe('needs-units')
    if (asked.status !== 'needs-units') return
    expect(asked.guess).toBe('in')
    expect(asked.maxDimension).toBeCloseTo(7.874, 2)

    const { part } = ready(await api.setUnits('in', () => {}))
    expect(part.sourceUnits).toBe('in')
    expect(part.scaleToMm).toBe(25.4)
    const size = [0, 1, 2].map((c) => part.bbox.max[c]! - part.bbox.min[c]!)
    expect(Math.max(...size)).toBeCloseTo(200, 2)
  })

  it('loads a binary file whose header starts with "solid"', async () => {
    const buffer = makeBinaryStl(TRIANGLES, 'solid exported by a cad tool')
    const asked = await createGeometryApi().loadStl(buffer, 'solid-header.stl', () => {})
    expect(['ready', 'needs-units']).toContain(asked.status)
  })

  it('refuses setUnits when no file is waiting for units', async () => {
    const api = createGeometryApi()
    const outcome = await api.setUnits('mm', () => {})
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') expectUserError(outcome.error)
  })
})

describe('geometry api: bad files come back as readable errors', () => {
  const sample = () => readSample('t-joint-merged')
  const nan = makeBinaryStl([[Number.NaN, 0, 0, 1, 0, 0, 0, 1, 0]])
  const cases: Array<[string, () => ArrayBuffer]> = [
    ['an empty file', () => new ArrayBuffer(0)],
    ['a header-only binary file', () => makeBinaryStl([])],
    ['a truncated binary file', () => sample().slice(0, 1000)],
    ['a file with a NaN coordinate', () => nan],
    ['OBJ text', () => new TextEncoder().encode('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n').buffer as ArrayBuffer],
    ['triangles that all collapse', () => makeBinaryStl([[1, 1, 1, 1, 1, 1, 1, 1, 1]])],
  ]

  it.each(cases)('%s gives what, why and next', async (_name, make) => {
    const outcome = await createGeometryApi().loadStl(make(), 'bad.stl', () => {})
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') expectUserError(outcome.error)
  })

  it('keeps the previous part when a later file fails', async () => {
    const api = createGeometryApi()
    ready(await api.loadStl(sample(), 'good.stl', () => {}))
    const failed = await api.loadStl(new ArrayBuffer(0), 'bad.stl', () => {})
    expect(failed.status).toBe('error')
    const detected = await api.detect(DEFAULT_DETECT_SETTINGS, () => {})
    expect(detected.status === 'ok' && shown(detected.seams).length).toBe(2)
  })
})

describe('geometry api: detect', () => {
  it('errors with what, why and next when nothing is loaded', async () => {
    const outcome = await createGeometryApi().detect(DEFAULT_DETECT_SETTINGS, () => {})
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') expectUserError(outcome.error)
  })

  it('finds the two T-joint seams and reports detect progress ending at 1', async () => {
    const api = createGeometryApi()
    ready(await api.loadStl(readSample('t-joint-merged'), 'a.stl', () => {}))
    const { events, onProgress } = recorder()
    const outcome = await api.detect(DEFAULT_DETECT_SETTINGS, onProgress)
    expect(outcome.status).toBe('ok')
    if (outcome.status !== 'ok') return
    expect(shown(outcome.seams)).toHaveLength(2)
    expect(outcome.ms).toBeGreaterThanOrEqual(0)
    expect(events.every(([stage]) => stage === 'detect')).toBe(true)
    expect(events[events.length - 1]![1]).toBe(1)
  })

  it('replaces the first part when a second file loads', async () => {
    const api = createGeometryApi()
    const first = ready(await api.loadStl(readSample('t-joint-merged'), 'first.stl', () => {}))
    const second = ready(await api.loadStl(readSample('box-beam'), 'second.stl', () => {}))
    expect(second.part.name).toBe('second.stl')
    expect(second.part.triangles).not.toBe(first.part.triangles)
    const detected = await api.detect(DEFAULT_DETECT_SETTINGS, () => {})
    expect(detected.status === 'ok' && shown(detected.seams).length).toBe(8)
  })
})

describe('geometry client over a real message channel', () => {
  const ports: MessagePort[] = []
  afterEach(() => {
    for (const port of ports.splice(0)) port.close()
  })

  function connect() {
    const { port1, port2 } = new MessageChannel()
    ports.push(port1, port2)
    Comlink.expose(createGeometryApi(), port1)
    return wrapGeometryApi(port2)
  }

  it('transfers the file in, proxies progress back and returns display data that still works', async () => {
    const client = connect()
    const buffer = readSample('t-joint-merged')
    const { events, onProgress } = recorder()
    const { display } = ready(await client.loadStl(buffer, 'a.stl', onProgress))
    expect(buffer.byteLength).toBe(0)
    // Proxied callbacks travel on their own port, so they may land after the response; that ordering is not guaranteed.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events.length).toBeGreaterThanOrEqual(4)
    expect(events[events.length - 1]![1]).toBe(1)
    expect(display.positions).toBeInstanceOf(Float32Array)
    expect(zHitAt(display, 0, 40)).toBeCloseTo(10, 3)

    const detected = await client.detect(DEFAULT_DETECT_SETTINGS, () => {})
    expect(detected.status === 'ok' && shown(detected.seams).length).toBe(2)
  })
})

describe('geometry api: contact seams', () => {
  it('finds the two contact seams of the T-joint assembly', async () => {
    const api = createGeometryApi()
    ready(await api.loadStl(readSample('t-joint-assembly'), 't-joint-assembly.stl', () => {}))
    const outcome = await api.detect(DEFAULT_DETECT_SETTINGS, () => {})
    expect(outcome.status === 'ok' && shown(outcome.seams).map((s) => s.source)).toEqual(['contact', 'contact'])
  })

  it('never builds body BVHs for a single body part', async () => {
    const api = createGeometryApi()
    ready(await api.loadStl(readSample('t-joint-merged'), 't-joint-merged.stl', () => {}))
    built.count = 0
    await api.detect(DEFAULT_DETECT_SETTINGS, () => {})
    expect(built.count).toBe(0)
  })

  it('builds the body BVHs once per loaded part and reuses them when the slider changes', async () => {
    const api = createGeometryApi()
    ready(await api.loadStl(readSample('t-joint-assembly'), 't-joint-assembly.stl', () => {}))
    built.count = 0
    await api.detect(DEFAULT_DETECT_SETTINGS, () => {})
    expect(built.count).toBe(2)
    await api.detect({ creaseAngleDeg: 45 }, () => {})
    await api.detect({ creaseAngleDeg: 20 }, () => {})
    expect(built.count).toBe(2)
  })

  it('rebuilds them for a newly loaded part', async () => {
    const api = createGeometryApi()
    ready(await api.loadStl(readSample('t-joint-assembly'), 'a.stl', () => {}))
    await api.detect(DEFAULT_DETECT_SETTINGS, () => {})
    ready(await api.loadStl(readSample('double-bottom-cell'), 'b.stl', () => {}))
    built.count = 0
    await api.detect(DEFAULT_DETECT_SETTINGS, () => {})
    expect(built.count).toBe(7)
  })

  it('reports a contact stage before the detect stage for multi body parts only', async () => {
    const api = createGeometryApi()
    ready(await api.loadStl(readSample('t-joint-assembly'), 'a.stl', () => {}))
    const { events, onProgress } = recorder()
    await api.detect(DEFAULT_DETECT_SETTINGS, onProgress)
    expect(events.some(([stage]) => stage === 'contact')).toBe(true)
    expect(events[events.length - 1]).toEqual(['detect', 1])
  })
})

describe('geometry api: winding repair', () => {
  it.each([
    ['t-joint-merged', 0],
    ['flipped-normals', 2],
  ])('reports the reoriented and unsigned body counts of %s', async (id, reoriented) => {
    const { part } = ready(await createGeometryApi().loadStl(readSample(id), `${id}.stl`, () => {}))
    expect(part.reorientedBodies).toBe(reoriented)
    expect(part.unsignedBodies).toBe(0)
  })

  it('detects the four fillets of flipped-normals through the worker api', async () => {
    const api = createGeometryApi()
    ready(await api.loadStl(readSample('flipped-normals'), 'flipped-normals.stl', () => {}))
    const outcome = await api.detect(DEFAULT_DETECT_SETTINGS, () => {})
    expect(outcome.status === 'ok' && shown(outcome.seams)).toHaveLength(4)
  })
})
