import * as Comlink from 'comlink'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_TORCH } from '../../../src/core/torch/frames'
import { DEFAULT_DETECT_SETTINGS } from '../../../src/core/seams/detect'
import { wrapGeometryApi, type GeometryClient } from '../../../src/worker/client'
import { createGeometryApi, type DetectOutcome, type GeometryApi } from '../../../src/worker/geometry.api'
import { createRecoveringClient } from '../../../src/worker/recovery'
import { deferred, shown } from '../helpers/state'
import { readSample } from '../helpers/samples'

const ports: MessagePort[] = []
afterEach(() => {
  for (const port of ports.splice(0)) port.close()
})

const noop = () => {}

interface Spawned {
  loads: number[]
  unitCalls: string[]
  die: (why: string) => void
}

// Every spawn is a real geometry api behind a real client, so a restored worker can actually detect.
function harness() {
  const spawned: Spawned[] = []
  const spawn = (onDead: () => void): GeometryClient => {
    const real = createGeometryApi()
    const record: Spawned = { loads: [], unitCalls: [], die: () => {} }
    const counted: GeometryApi = {
      loadStl: (buffer, name, onProgress) => {
        record.loads.push(buffer.byteLength)
        return real.loadStl(buffer, name, onProgress)
      },
      setUnits: (units, onProgress) => {
        record.unitCalls.push(units)
        return real.setUnits(units, onProgress)
      },
      detect: (settings, onProgress) => real.detect(settings, onProgress),
      snapDraw: (clicks, radius) => real.snapDraw(clicks, radius),
      snapPreview: (point, radius) => real.snapPreview(point, radius),
      torchPositions: (seams, gravity) => real.torchPositions(seams, gravity),
      torchPoses: (seam, params) => real.torchPoses(seam, params),
      access: (seams, onProgress) => real.access(seams, onProgress),
      reach: (seams, ports, arm, onProgress) => real.reach(seams, ports, arm, onProgress),
      insertion: (seam, s, port, arm, approachMm) => real.insertion(seam, s, port, arm, approachMm),
      preflight: (plan) => real.preflight(plan),
      planTiming: (plan) => real.planTiming(plan),
      playbackPath: (plan) => real.playbackPath(plan),
      optimiseSequence: (plan, strategy, locked, order) => real.optimiseSequence(plan, strategy, locked, order),
      exportJob: (plan, createdAt) => real.exportJob(plan, createdAt),
    }
    const { port1, port2 } = new MessageChannel()
    ports.push(port1, port2)
    Comlink.expose(counted, port1)
    const dead = deferred<string>()
    record.die = dead.resolve
    spawned.push(record)
    return wrapGeometryApi(port2, { failure: dead.promise, onFailure: onDead, timeoutMs: 5000 })
  }
  return { spawned, client: createRecoveringClient(spawn) }
}

function seamCount(outcome: DetectOutcome): number {
  if (outcome.status !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(outcome).slice(0, 200)}`)
  return shown(outcome.seams).length
}

describe('recovering client', () => {
  it('rebuilds the part in a replacement worker so detect keeps working after a crash', async () => {
    const { client, spawned } = harness()
    const file = readSample('t-joint-merged')
    const size = file.byteLength
    expect((await client.loadStl(file, 'a.stl', noop)).status).toBe('ready')
    expect(file.byteLength).toBe(0)

    spawned[0]!.die('Uncaught RangeError: out of memory')
    const lost = await client.detect(DEFAULT_DETECT_SETTINGS, noop)
    expect(lost.status).toBe('error')

    expect(seamCount(await client.detect(DEFAULT_DETECT_SETTINGS, noop))).toBe(2)
    expect(spawned).toHaveLength(2)
    expect(spawned[1]!.loads).toEqual([size])
  })

  it('restores the part before the access check, which casts rays against it', async () => {
    const { client, spawned } = harness()
    expect((await client.loadStl(readSample('t-joint-merged'), 'a.stl', noop)).status).toBe('ready')
    const found = await client.detect(DEFAULT_DETECT_SETTINGS, noop)
    if (found.status !== 'ok') throw new Error('detect failed')
    const seams = shown(found.seams)

    spawned[0]!.die('Uncaught RangeError: out of memory')
    expect((await client.access(seams, noop)).status).toBe('error')
    const outcome = await client.access(seams, noop)
    expect(outcome.status).toBe('ok')
    expect(spawned).toHaveLength(2)
  })

  it('restores the part before a drawn seam is snapped, too', async () => {
    const { client, spawned } = harness()
    await client.loadStl(readSample('t-joint-merged'), 'a.stl', noop)
    const clicks = [[-99.5, 5.3, 10.2], [99.5, 5.2, 9.8]].map((p) => ({ p: p as [number, number, number] }))

    spawned[0]!.die('boom')
    expect((await client.snapDraw(clicks, 3)).status).toBe('error')
    const outcome = await client.snapDraw(clicks, 3)

    expect(outcome.status).toBe('ok')
    if (outcome.status === 'ok') expect(outcome.seam.lengthMm).toBeGreaterThan(198.5)
    expect(spawned).toHaveLength(2)
    expect(spawned[1]!.loads).toHaveLength(1)
  })

  it('answers the torch calls from a replacement worker without sending the file again', async () => {
    const { client, spawned } = harness()
    await client.loadStl(readSample('t-joint-merged'), 'a.stl', noop)
    const found = await client.detect(DEFAULT_DETECT_SETTINGS, noop)
    if (found.status !== 'ok') throw new Error('expected ok')

    spawned[0]!.die('boom')
    expect((await client.torchPositions(found.seams, [0, 0, -1])).status).toBe('error')
    const positions = await client.torchPositions(found.seams, [0, 0, -1])
    const poses = await client.torchPoses(found.seams[0]!, DEFAULT_TORCH)

    expect(positions.status).toBe('ok')
    expect(poses.status).toBe('ok')
    expect(spawned).toHaveLength(2)
    expect(spawned[1]!.loads).toHaveLength(0)
  })

  it('keeps the unit choice, so an inch part is not rebuilt as millimetres', async () => {
    const { client, spawned } = harness()
    expect((await client.loadStl(readSample('t-joint-inch'), 'in.stl', noop)).status).toBe('needs-units')
    expect((await client.setUnits('in', noop)).status).toBe('ready')

    spawned[0]!.die('boom')
    await client.detect(DEFAULT_DETECT_SETTINGS, noop)
    const outcome = await client.detect(DEFAULT_DETECT_SETTINGS, noop)

    expect(seamCount(outcome)).toBe(2)
    if (outcome.status === 'ok') expect(shown(outcome.seams)[0]!.lengthMm).toBeCloseTo(200, 0)
    expect(spawned[1]!.unitCalls).toEqual(['in'])
  })

  it('restores the newest loaded part, not an older one', async () => {
    const { client, spawned } = harness()
    await client.loadStl(readSample('t-joint-merged'), 'a.stl', noop)
    await client.loadStl(readSample('l-bracket-gussets'), 'b.stl', noop)

    spawned[0]!.die('boom')
    await client.detect(DEFAULT_DETECT_SETTINGS, noop)

    expect(seamCount(await client.detect(DEFAULT_DETECT_SETTINGS, noop))).toBe(16)
  })

  it('keeps the earlier part when a later load fails, because the app still shows it', async () => {
    const { client, spawned } = harness()
    await client.loadStl(readSample('t-joint-merged'), 'a.stl', noop)
    expect((await client.loadStl(new ArrayBuffer(0), 'empty.stl', noop)).status).toBe('error')

    spawned[0]!.die('boom')
    await client.detect(DEFAULT_DETECT_SETTINGS, noop)

    expect(seamCount(await client.detect(DEFAULT_DETECT_SETTINGS, noop))).toBe(2)
  })

  it('sends the file once when several detects arrive at the same time', async () => {
    const { client, spawned } = harness()
    await client.loadStl(readSample('t-joint-merged'), 'a.stl', noop)
    spawned[0]!.die('boom')
    await client.detect(DEFAULT_DETECT_SETTINGS, noop)

    const results = await Promise.all([
      client.detect(DEFAULT_DETECT_SETTINGS, noop),
      client.detect(DEFAULT_DETECT_SETTINGS, noop),
      client.detect(DEFAULT_DETECT_SETTINGS, noop),
    ])

    expect(results.map(seamCount)).toEqual([2, 2, 2])
    expect(spawned[1]!.loads).toHaveLength(1)
  })

  it('does not re-send the old file when the next call is a new load', async () => {
    const { client, spawned } = harness()
    await client.loadStl(readSample('t-joint-merged'), 'a.stl', noop)
    spawned[0]!.die('boom')
    await client.detect(DEFAULT_DETECT_SETTINGS, noop)

    const next = readSample('l-bracket-gussets')
    const size = next.byteLength
    expect((await client.loadStl(next, 'b.stl', noop)).status).toBe('ready')

    expect(spawned[1]!.loads).toEqual([size])
    expect(seamCount(await client.detect(DEFAULT_DETECT_SETTINGS, noop))).toBe(16)
  })

  it('still restores the old part when the load after a crash fails', async () => {
    const { client, spawned } = harness()
    await client.loadStl(readSample('t-joint-merged'), 'a.stl', noop)
    spawned[0]!.die('boom')
    await client.detect(DEFAULT_DETECT_SETTINGS, noop)

    expect((await client.loadStl(new ArrayBuffer(0), 'empty.stl', noop)).status).toBe('error')

    expect(seamCount(await client.detect(DEFAULT_DETECT_SETTINGS, noop))).toBe(2)
  })

  it('reports the worker error as a value when the replacement dies while rebuilding', async () => {
    const { client, spawned } = harness()
    await client.loadStl(readSample('t-joint-merged'), 'a.stl', noop)
    spawned[0]!.die('boom')
    await client.detect(DEFAULT_DETECT_SETTINGS, noop)

    const pending = client.detect(DEFAULT_DETECT_SETTINGS, noop)
    spawned[1]!.die('second crash')
    const outcome = await pending

    expect(outcome.status).toBe('error')
    expect(seamCount(await client.detect(DEFAULT_DETECT_SETTINGS, noop))).toBe(2)
    expect(spawned).toHaveLength(3)
  })

  it('leaves a never-loaded session alone, so detect reports that there is no part', async () => {
    const { client, spawned } = harness()
    const outcome = await client.detect(DEFAULT_DETECT_SETTINGS, noop)
    expect(outcome.status).toBe('error')
    expect(spawned).toHaveLength(1)
    expect(spawned[0]!.loads).toEqual([])
  })
})
