import { beforeEach, describe, expect, it } from 'vitest'
import type { SampleEntry } from '../../../src/core/samples/manifest'
import { chooseUnits, fetchManifest, importBuffer, importFile, importSample, runDetect } from '../../../src/state/flows'
import { selectStats } from '../../../src/state/selectors'
import { useStore } from '../../../src/state/store'
import type { DetectOutcome, LoadOutcome, Progress } from '../../../src/worker/geometry.api'
import { readManifest, readSample } from '../helpers/samples'
import { deferred, detected, fakeClient, readyOutcome, resetStore, seam } from '../helpers/state'

const state = () => useStore.getState()
const buffer = () => new ArrayBuffer(16)

function expectReadable(error: { what: string; why: string; next: string }) {
  for (const part of [error.what, error.why, error.next]) expect(part.trim().length).toBeGreaterThan(0)
}

function expectErrorState() {
  const { importState } = state()
  expect(importState.phase).toBe('error')
  if (importState.phase !== 'error') throw new Error('unreachable')
  expectReadable(importState.error)
  return importState.error
}

beforeEach(resetStore)

describe('importBuffer', () => {
  it('shows loading while the worker reports progress, then loads the part and detects with defaults', async () => {
    const gate = deferred<LoadOutcome>()
    let detectArgs: unknown
    const client = fakeClient({
      loadStl: async (_b, _n, onProgress) => {
        onProgress('weld', 0.3)
        return gate.promise
      },
      detect: async (settings) => {
        detectArgs = settings
        return detected([seam('a'), seam('b')])
      },
    })
    useStore.setState({ detectSettings: { creaseAngleDeg: 50 } })
    const done = importBuffer(buffer(), 'a.stl', client)
    expect(state().importState).toMatchObject({ phase: 'loading', fraction: 0.3 })
    gate.resolve(readyOutcome())
    await done

    expect(state().importState).toEqual({ phase: 'idle' })
    expect(state().part?.name).toBe('a.stl')
    expect(state().display).not.toBeNull()
    expect(state().activeStep).toBe('seams')
    expect(detectArgs).toEqual({ creaseAngleDeg: 30 })
    expect(state().detectSettings.creaseAngleDeg).toBe(30)
    expect(state().seams.map((s) => s.id)).toEqual(['a', 'b'])
    expect(state().detectBusy).toBe(false)
  })

  it('starts in the loading phase before the worker has said anything', () => {
    const client = fakeClient({ loadStl: () => new Promise<LoadOutcome>(() => {}) })
    void importBuffer(buffer(), 'a.stl', client)
    const { importState } = state()
    expect(importState.phase).toBe('loading')
    if (importState.phase === 'loading') {
      expect(importState.fraction).toBe(0)
      expect(importState.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('clears accepted seams, selection and undo history when a new part loads', async () => {
    const client = fakeClient({ loadStl: async () => readyOutcome(), detect: async () => detected([seam('a'), seam('b')]) })
    await importBuffer(buffer(), 'first.stl', client)
    state().toggleAccepted('a')
    state().select('a')
    expect(useStore.temporal.getState().pastStates).toHaveLength(1)

    await importBuffer(buffer(), 'second.stl', client)
    expect(state().statusById).toEqual({})
    expect(state().selectedId).toBeNull()
    expect(useStore.temporal.getState().pastStates).toHaveLength(0)
    expect(useStore.temporal.getState().futureStates).toHaveLength(0)
    useStore.temporal.getState().undo()
    expect(state().statusById).toEqual({})
  })

  it('asks for units, then loads the part after chooseUnits', async () => {
    const asked: LoadOutcome = { status: 'needs-units', maxDimension: 7.87, guess: 'in' }
    let chosen: string | undefined
    const client = fakeClient({
      loadStl: async () => asked,
      setUnits: async (units, onProgress) => {
        chosen = units
        onProgress('weld', 0.4)
        return readyOutcome({ sourceUnits: 'in', scaleToMm: 25.4 })
      },
      detect: async () => detected([seam('a')]),
    })
    await importBuffer(buffer(), 'inch.stl', client)
    expect(state().importState).toEqual({ phase: 'needs-units', fileName: 'inch.stl', maxDimension: 7.87, guess: 'in' })
    expect(state().part).toBeNull()

    await chooseUnits('in', client)
    expect(chosen).toBe('in')
    expect(state().importState).toEqual({ phase: 'idle' })
    expect(state().part).toMatchObject({ name: 'a.stl', sourceUnits: 'in' })
    expect(state().seams).toHaveLength(1)
  })

  it('does nothing when chooseUnits is called with no file waiting', async () => {
    await chooseUnits('mm', fakeClient())
    expect(state().importState).toEqual({ phase: 'idle' })
  })

  it('turns an error outcome into the error phase and keeps the previous part', async () => {
    const good = fakeClient({ loadStl: async () => readyOutcome() })
    await importBuffer(buffer(), 'good.stl', good)
    const bad = fakeClient({
      loadStl: async () => ({ status: 'error', error: { what: 'The file is empty.', why: 'It has 0 bytes.', next: 'Export it again.' } }),
    })
    await importBuffer(buffer(), 'bad.stl', bad)
    expect(state().importState).toEqual({
      phase: 'error',
      error: { what: 'The file is empty.', why: 'It has 0 bytes.', next: 'Export it again.' },
    })
    expect(state().part?.name).toBe('a.stl')
  })

  it('turns a throwing client into a generic what, why and next error', async () => {
    const client = fakeClient({
      loadStl: async () => {
        throw new Error('worker crashed')
      },
    })
    await importBuffer(buffer(), 'a.stl', client)
    const error = expectErrorState()
    expect(error.why).toContain('worker crashed')
  })

  it('ignores progress that arrives after the outcome', async () => {
    let late!: Progress
    const client = fakeClient({
      loadStl: async (_b, _n, onProgress) => {
        late = onProgress
        return readyOutcome()
      },
    })
    await importBuffer(buffer(), 'a.stl', client)
    late('weld', 0.5)
    expect(state().importState).toEqual({ phase: 'idle' })
  })

  it('shows a detect failure in the error banner and stops the busy flag', async () => {
    const client = fakeClient({
      loadStl: async () => readyOutcome(),
      detect: async () => ({ status: 'error', error: { what: 'Detection failed.', why: 'Out of memory.', next: 'Try a smaller part.' } }),
    })
    await importBuffer(buffer(), 'a.stl', client)
    expect(expectErrorState().what).toBe('Detection failed.')
    expect(state().detectBusy).toBe(false)
    expect(state().part).not.toBeNull()
  })
})

describe('runDetect', () => {
  it('keeps the result of the newest call when an older call resolves last', async () => {
    const first = deferred<DetectOutcome>()
    const second = deferred<DetectOutcome>()
    const queue = [first, second]
    const client = fakeClient({ detect: () => queue.shift()!.promise })
    const a = runDetect({ creaseAngleDeg: 20 }, client)
    const b = runDetect({ creaseAngleDeg: 40 }, client)
    second.resolve(detected([seam('new')]))
    await b
    first.resolve(detected([seam('old')]))
    await a
    expect(state().seams.map((s) => s.id)).toEqual(['new'])
    expect(state().detectBusy).toBe(false)
  })

  it('stays busy until the newest call settles, even if an older one finishes first', async () => {
    const first = deferred<DetectOutcome>()
    const second = deferred<DetectOutcome>()
    const queue = [first, second]
    const client = fakeClient({ detect: () => queue.shift()!.promise })
    const a = runDetect({ creaseAngleDeg: 20 }, client)
    const b = runDetect({ creaseAngleDeg: 40 }, client)
    first.resolve(detected([seam('old')]))
    await a
    expect(state().detectBusy).toBe(true)
    expect(state().seams).toEqual([])
    second.resolve(detected([seam('new')]))
    await b
    expect(state().seams.map((s) => s.id)).toEqual(['new'])
    expect(state().detectBusy).toBe(false)
  })

  it('keeps accepted seams when the slider hides them and restores them when it returns', async () => {
    const both = [seam('a', 0.9, 200), seam('b', 0.9, 200)]
    const client = fakeClient({ detect: async (settings) => detected(settings.creaseAngleDeg > 40 ? [both[1]!] : both) })
    await runDetect({ creaseAngleDeg: 30 }, client)
    state().toggleAccepted('a')
    state().toggleAccepted('b')

    await runDetect({ creaseAngleDeg: 50 }, client)
    expect(state().statusById).toEqual({ a: 'accepted', b: 'accepted' })
    expect(selectStats(state())).toMatchObject({ accepted: 1, hiddenAccepted: 1, acceptedLengthMm: 200 })

    await runDetect({ creaseAngleDeg: 30 }, client)
    expect(selectStats(state())).toMatchObject({ accepted: 2, hiddenAccepted: 0, acceptedLengthMm: 400 })
  })

  it('drops a selection or hover that points at a seam the new result no longer has', async () => {
    const client = fakeClient({ detect: async (s) => detected(s.creaseAngleDeg > 40 ? [seam('b')] : [seam('a'), seam('b')]) })
    await runDetect({ creaseAngleDeg: 30 }, client)
    state().select('a')
    state().hover('a')
    await runDetect({ creaseAngleDeg: 50 }, client)
    expect(state().selectedId).toBeNull()
    expect(state().hoverId).toBeNull()
  })

  it('keeps a selection that survives the new result', async () => {
    const client = fakeClient({ detect: async () => detected([seam('a'), seam('b')]) })
    await runDetect({ creaseAngleDeg: 30 }, client)
    state().select('b')
    await runDetect({ creaseAngleDeg: 35 }, client)
    expect(state().selectedId).toBe('b')
  })

  it('turns a throwing client into a readable error and clears the busy flag', async () => {
    const client = fakeClient({
      detect: async () => {
        throw new Error('port closed')
      },
    })
    await runDetect({ creaseAngleDeg: 30 }, client)
    expect(expectErrorState().why).toContain('port closed')
    expect(state().detectBusy).toBe(false)
  })
})

describe('fetchManifest', () => {
  const json = (body: unknown, init?: ResponseInit) => async () => new Response(JSON.stringify(body), init)

  it('returns the validated manifest', async () => {
    const outcome = await fetchManifest(json(readManifest()))
    expect(outcome.status === 'ok' && outcome.manifest.samples.map((s) => s.id)).toEqual(readManifest().samples.map((s) => s.id))
  })

  it('reports a missing manifest with the HTTP status', async () => {
    const outcome = await fetchManifest(async () => new Response('', { status: 404, statusText: 'Not Found' }))
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') {
      expectReadable(outcome.error)
      expect(outcome.error.why).toContain('404')
    }
  })

  it('reports a network failure', async () => {
    const outcome = await fetchManifest(async () => {
      throw new TypeError('offline')
    })
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') expectReadable(outcome.error)
  })

  it.each([
    ['an HTML page instead of JSON', async () => new Response('<!doctype html><title>x</title>')],
    ['a manifest of the wrong version', json({ version: 2, samples: [] })],
    ['a manifest with no samples', json({ version: 1, samples: [] })],
  ])('reports %s', async (_name, fetchFn) => {
    const outcome = await fetchManifest(fetchFn)
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') expectReadable(outcome.error)
  })
})

describe('importSample', () => {
  const entry: SampleEntry = readManifest().samples.find((s) => s.id === 't-joint-merged')!

  it('fetches the STL next to the manifest and loads it under its file name', async () => {
    const requested: string[] = []
    const received: Array<[number, string]> = []
    const bytes = readSample('t-joint-merged')
    const client = fakeClient({
      loadStl: async (b, name) => {
        received.push([b.byteLength, name])
        return readyOutcome({ name })
      },
    })
    await importSample(
      entry,
      client,
      async (url) => {
        requested.push(url)
        return new Response(bytes)
      },
    )
    expect(requested).toEqual(['/samples/t-joint-merged.stl'])
    expect(received).toEqual([[bytes.byteLength, 't-joint-merged.stl']])
    expect(state().part?.name).toBe('t-joint-merged.stl')
  })

  it('shows a readable error when the sample file is missing', async () => {
    await importSample(entry, fakeClient(), async () => new Response('', { status: 404, statusText: 'Not Found' }))
    expect(expectErrorState().why).toContain('404')
    expect(state().part).toBeNull()
  })

  it('shows a readable error when the request fails', async () => {
    await importSample(entry, fakeClient(), async () => {
      throw new TypeError('offline')
    })
    expectErrorState()
  })
})

describe('importFile', () => {
  it('shows the loading bar while the file is read, then loads it under its own name', async () => {
    const gate = deferred<ArrayBuffer>()
    let received: [number, string] | undefined
    const client = fakeClient({
      loadStl: async (b, name) => {
        received = [b.byteLength, name]
        return readyOutcome({ name })
      },
    })
    const done = importFile({ name: 'bracket.stl', arrayBuffer: () => gate.promise }, client)
    expect(state().importState).toMatchObject({ phase: 'loading', fraction: 0 })
    gate.resolve(new ArrayBuffer(3))
    await done
    expect(received).toEqual([3, 'bracket.stl'])
    expect(state().part?.name).toBe('bracket.stl')
  })

  it('shows a readable error naming the file when it cannot be read', async () => {
    const file = {
      name: 'gone.stl',
      arrayBuffer: async (): Promise<ArrayBuffer> => {
        throw new DOMException('permission denied', 'NotReadableError')
      },
    }
    await importFile(file, fakeClient())
    const error = expectErrorState()
    expect(error.what).toContain('gone.stl')
    expect(error.why).toContain('permission denied')
    expect(state().part).toBeNull()
  })
})
