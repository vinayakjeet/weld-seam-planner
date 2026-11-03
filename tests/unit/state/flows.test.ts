import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SampleEntry } from '../../../src/core/samples/manifest'
import { pointsFromPolyline } from '../../../src/core/seams/frames'
import { positionFor, posesFor } from '../../../src/state/torchSlice'
import type { SeamCandidate } from '../../../src/core/seams/detect'
import {
  changeGravity,
  chooseTool,
  chooseUnits,
  DETECT_DEBOUNCE_MS,
  dismissNotice,
  dropFile,
  drawSeam,
  fetchManifest,
  importBuffer,
  importFile,
  importSample,
  redoEdit,
  refreshPoses,
  refreshPositions,
  removeSelected,
  reverseSelected,
  runDetect,
  scheduleDetect,
  startTorchSync,
  toolEvent,
  trimSelected,
  undoEdit,
} from '../../../src/state/flows'
import { selectAllSeams, selectStats } from '../../../src/state/selectors'
import { useStore } from '../../../src/state/store'
import { createGeometryApi, type DetectOutcome, type GeometryApi, type LoadOutcome, type Progress } from '../../../src/worker/geometry.api'
import { readManifest, readSample } from '../helpers/samples'
import { deferred, detected, fakeClient, partInfo, readyOutcome, resetStore, seam } from '../helpers/state'

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
    state().setType('b', 'lap')
    state().select('a')
    expect(useStore.temporal.getState().pastStates).toHaveLength(2)

    await importBuffer(buffer(), 'second.stl', client)
    expect(state().statusById).toEqual({})
    expect(state().typeById).toEqual({})
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

describe('unexpected failures are shown, never left on the loading bar', () => {
  const unreadable = <T>() => (async () => undefined as unknown as T)

  it('importBuffer: a result the app cannot read becomes an error, not a stuck bar', async () => {
    await importBuffer(buffer(), 'a.stl', fakeClient({ loadStl: unreadable<LoadOutcome>() }))
    expectErrorState()
  })

  it('chooseUnits: a result the app cannot read becomes an error', async () => {
    useStore.setState({ importState: { phase: 'needs-units', fileName: 'x.stl', maxDimension: 7, guess: 'in' } })
    await chooseUnits('in', fakeClient({ setUnits: unreadable<LoadOutcome>() }))
    expectErrorState()
  })

  it('runDetect: a result the app cannot read becomes an error and clears the busy flag', async () => {
    await runDetect({ creaseAngleDeg: 30 }, fakeClient({ detect: async () => ({ status: 'ok', ms: 1 }) as unknown as DetectOutcome }))
    expectErrorState()
    expect(state().detectBusy).toBe(false)
  })

  it('importFile and importSample: an unreadable result becomes an error', async () => {
    const client = fakeClient({ loadStl: unreadable<LoadOutcome>() })
    await importFile({ name: 'a.stl', arrayBuffer: async () => buffer() }, client)
    expectErrorState()
    resetStore()
    await importSample(readManifest().samples[0]!, client, async () => new Response(buffer()))
    expectErrorState()
  })

  it('names the problem as unexpected rather than blaming the worker', async () => {
    await importBuffer(buffer(), 'a.stl', fakeClient({ loadStl: unreadable<LoadOutcome>() }))
    expect(expectErrorState().what).toMatch(/unexpected/i)
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

  it('keeps type overrides across a new detection run', async () => {
    const client = fakeClient({ detect: async () => detected([seam('a'), seam('b')]) })
    await runDetect({ creaseAngleDeg: 30 }, client)
    state().setType('a', 'saddle')
    await runDetect({ creaseAngleDeg: 35 }, client)
    expect(state().typeById).toEqual({ a: 'saddle' })
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

describe('dropFile', () => {
  const file = { name: 'dropped.stl', arrayBuffer: async () => new ArrayBuffer(4) }

  function loadingClient() {
    const loaded: string[] = []
    const client = fakeClient({
      loadStl: async (_b, name) => {
        loaded.push(name)
        return readyOutcome({ name })
      },
    })
    return { client, loaded }
  }

  it('loads the file when no part is open', async () => {
    const { client, loaded } = loadingClient()
    dropFile(file, client)
    await vi.waitFor(() => expect(state().part?.name).toBe('dropped.stl'))
    expect(loaded).toEqual(['dropped.stl'])
  })

  it('opens the Import step instead of replacing a part the user is working on', async () => {
    const { client, loaded } = loadingClient()
    useStore.setState({ part: partInfo(), activeStep: 'seams' })
    dropFile(file, client)
    await Promise.resolve()
    expect(state().activeStep).toBe('import')
    expect(loaded).toEqual([])
    expect(state().part?.name).toBe('a.stl')
  })

  it('loads the file when the Import step is already open', async () => {
    const { client, loaded } = loadingClient()
    useStore.setState({ part: partInfo(), activeStep: 'import' })
    dropFile(file, client)
    await vi.waitFor(() => expect(state().part?.name).toBe('dropped.stl'))
    expect(loaded).toEqual(['dropped.stl'])
  })

  it('loads the file when the last import ended in an error', async () => {
    const { client, loaded } = loadingClient()
    useStore.setState({ importState: { phase: 'error', error: { what: 'a', why: 'b', next: 'c' } } })
    dropFile(file, client)
    await vi.waitFor(() => expect(state().part?.name).toBe('dropped.stl'))
    expect(loaded).toEqual(['dropped.stl'])
  })

  it.each([
    ['loading', { phase: 'loading', label: 'Reading file', fraction: 0.2 }],
    ['waiting for a unit answer', { phase: 'needs-units', fileName: 'x.stl', maxDimension: 7, guess: 'in' }],
  ] as const)('ignores a drop while %s', async (_name, importState) => {
    const { client, loaded } = loadingClient()
    useStore.setState({ importState })
    dropFile(file, client)
    await Promise.resolve()
    expect(loaded).toEqual([])
    expect(state().importState).toEqual(importState)
  })

  it('does nothing for a drop without a file', async () => {
    const { client, loaded } = loadingClient()
    dropFile(undefined, client)
    await Promise.resolve()
    expect(loaded).toEqual([])
    expect(state().importState).toEqual({ phase: 'idle' })
  })
})

describe('scheduleDetect', () => {
  afterEach(() => vi.useRealTimers())

  function detectRecorder() {
    const angles: number[] = []
    const client = fakeClient({
      loadStl: async () => readyOutcome(),
      detect: async (settings) => {
        angles.push(settings.creaseAngleDeg)
        return detected([seam(`at-${settings.creaseAngleDeg}`)])
      },
    })
    return { client, angles }
  }

  it('waits 250 ms', () => {
    expect(DETECT_DEBOUNCE_MS).toBe(250)
  })

  it('shows the new angle at once and detects once, after the last change settles', async () => {
    vi.useFakeTimers()
    const { client, angles } = detectRecorder()
    useStore.setState({ part: partInfo() })

    scheduleDetect({ creaseAngleDeg: 40 }, client)
    expect(state().detectSettings.creaseAngleDeg).toBe(40)
    await vi.advanceTimersByTimeAsync(200)
    scheduleDetect({ creaseAngleDeg: 45 }, client)
    expect(state().detectSettings.creaseAngleDeg).toBe(45)

    await vi.advanceTimersByTimeAsync(DETECT_DEBOUNCE_MS - 1)
    expect(angles).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(angles).toEqual([45])
    expect(state().seams.map((s) => s.id)).toEqual(['at-45'])
  })

  it('keeps accepted seams through a round trip of the angle', async () => {
    vi.useFakeTimers()
    const client = fakeClient({
      detect: async (settings) => detected(settings.creaseAngleDeg === 30 ? [seam('a'), seam('b')] : [seam('a')]),
    })
    useStore.setState({ part: partInfo(), seams: [seam('a'), seam('b')], statusById: { b: 'accepted' } })

    scheduleDetect({ creaseAngleDeg: 50 }, client)
    await vi.advanceTimersByTimeAsync(DETECT_DEBOUNCE_MS)
    expect(state().seams.map((s) => s.id)).toEqual(['a'])
    expect(selectStats(state()).hiddenAccepted).toBe(1)

    scheduleDetect({ creaseAngleDeg: 30 }, client)
    await vi.advanceTimersByTimeAsync(DETECT_DEBOUNCE_MS)
    expect(selectStats(state())).toMatchObject({ accepted: 1, candidates: 1, hiddenAccepted: 0 })
  })

  it('is cancelled when a new part is loaded, so the old angle is not applied to it', async () => {
    vi.useFakeTimers()
    const { client, angles } = detectRecorder()
    useStore.setState({ part: partInfo() })

    scheduleDetect({ creaseAngleDeg: 55 }, client)
    await importBuffer(buffer(), 'next.stl', client)
    expect(angles).toEqual([30])
    await vi.advanceTimersByTimeAsync(DETECT_DEBOUNCE_MS * 2)

    expect(angles).toEqual([30])
    expect(state().detectSettings.creaseAngleDeg).toBe(30)
    expect(state().seams.map((s) => s.id)).toEqual(['at-30'])
  })

  it('does nothing without a part, because there is nothing to detect on', async () => {
    vi.useFakeTimers()
    const { client, angles } = detectRecorder()
    scheduleDetect({ creaseAngleDeg: 40 }, client)
    await vi.advanceTimersByTimeAsync(DETECT_DEBOUNCE_MS * 2)
    expect(angles).toEqual([])
    expect(state().importState).toEqual({ phase: 'idle' })
  })
})

describe('manual seams across detection and loading', () => {
  const manual = seam('a/a', 1, 80, { source: 'manual' })

  it('keeps manual seams and superseded ids through a re-detect with other settings', async () => {
    useStore.setState({ seams: [seam('a'), seam('b')], manualSeams: [manual], supersededIds: ['a'], selectedId: 'a/a' })
    const client = fakeClient({ detect: async () => detected([seam('a'), seam('b'), seam('z')]) })
    await runDetect({ creaseAngleDeg: 50 }, client)

    expect(state().manualSeams).toEqual([manual])
    expect(state().supersededIds).toEqual(['a'])
    expect(selectAllSeams(state()).map((s) => s.id)).toEqual(['b', 'z', 'a/a'])
    expect(state().selectedId).toBe('a/a')
  })

  it('clears manual seams and superseded ids when a new part loads, and the drawn numbering restarts', async () => {
    useStore.setState({ manualSeams: [manual], supersededIds: ['a'], nextDrawnId: 4 })
    await importBuffer(buffer(), 'b.stl', fakeClient({ loadStl: async () => readyOutcome(), detect: async () => detected([seam('a')]) }))
    expect(state().manualSeams).toEqual([])
    expect(state().supersededIds).toEqual([])
    expect(state().nextDrawnId).toBe(1)
  })
})

describe('plan state across loading', () => {
  it('keeps the procedure library and clears assignments, overrides, legs, thickness edits and the selection', async () => {
    const custom = { ...useStore.getState().procedures[0]!, id: 'WPS-KEEP', name: 'Keep' }
    useStore.getState().addProcedure(custom)
    useStore.setState({
      seams: [seam('a'), seam('b')],
      procedureById: { a: 'WPS-KEEP' },
      overridesById: { a: { travelSpeedMmS: 3 } },
      legById: { a: 5 },
      thicknessById: { a: [8, 8] },
      selectedId: 'a',
      selectedIds: ['a', 'b'],
    })
    await importBuffer(buffer(), 'b.stl', fakeClient({ loadStl: async () => readyOutcome(), detect: async () => detected([seam('a')]) }))
    expect(state().procedures.map((p) => p.id)).toContain('WPS-KEEP')
    expect(state().procedureById).toEqual({})
    expect(state().overridesById).toEqual({})
    expect(state().legById).toEqual({})
    expect(state().thicknessById).toEqual({})
    expect(state().selectedIds).toEqual([])
    expect(state().selectedId).toBeNull()
  })
})

describe('multi-selection after seams go away', () => {
  it('drops ids a re-detect no longer produces', async () => {
    useStore.setState({ seams: [seam('a'), seam('b'), seam('c')], selectedId: 'c', selectedIds: ['a', 'c'], rangeAnchor: 'a' })
    await runDetect({ creaseAngleDeg: 50 }, fakeClient({ detect: async () => detected([seam('a'), seam('b')]) }))
    expect(state().selectedIds).toEqual(['a'])
    expect(state().selectedId).toBe('a')
    expect(state().rangeAnchor).toBe('a')
  })

  it('drops the children of a split from the selection when it is undone', () => {
    const { points, lengthMm } = pointsFromPolyline([[0, 0, 0], [200, 0, 0]], false, () => [[0, 1, 0], [0, 0, 1]])
    useStore.setState({ seams: [seam('a', 0.9, lengthMm, { points }), seam('b')] })
    state().select('b')
    state().select('a', 'toggle')
    state().splitAt('a', 80)
    expect(state().selectedIds).toEqual(['b', 'a/a'])
    undoEdit()
    expect(state().selectedIds).toEqual(['b'])
    expect(state().selectedId).toBe('b')
  })
})

describe('drawSeam', () => {
  const clicks = [{ p: [0, 0, 0] as [number, number, number], face: 0 }, { p: [50, 0, 0] as [number, number, number], face: 0 }]

  it('adds the snapped seam as an accepted drawn seam and passes the radius to the worker', async () => {
    let radius = 0
    const client = fakeClient({
      snapDraw: async (_clicks, r) => {
        radius = r
        return { status: 'ok', seam: seam('drawn', 1, 50, { source: 'manual' }) }
      },
    })
    expect(await drawSeam(clicks, client, 4)).toBeNull()
    expect(radius).toBe(4)
    expect(state().manualSeams.map((s) => s.id)).toEqual(['drawn-1'])
    expect(state().statusById).toEqual({ 'drawn-1': 'accepted' })
  })

  it('returns the worker error and adds nothing', async () => {
    const error = { what: 'No seam was drawn.', why: 'Too few clicks.', next: 'Click again.' }
    const client = fakeClient({ snapDraw: async () => ({ status: 'error', error }) })
    expect(await drawSeam(clicks, client)).toEqual(error)
    expect(state().manualSeams).toEqual([])
  })

  it('turns a failing worker into a readable error', async () => {
    const client = fakeClient({
      snapDraw: async () => {
        throw new Error('boom')
      },
    })
    const error = await drawSeam(clicks, client)
    expectReadable(error!)
    expect(state().manualSeams).toEqual([])
  })
})

describe('manual tool flows', () => {
  const lineSeam = (id: string, from: number, to: number): SeamCandidate => {
    const { points, lengthMm } = pointsFromPolyline([[from, 0, 0], [to, 0, 0]], false, () => [[0, 1, 0], [0, 0, 1]])
    return seam(id, 0.8, lengthMm, { points })
  }
  const ids = () => selectAllSeams(state()).map((s) => s.id)
  const none = fakeClient()
  const click = (x: number) => ({ type: 'click', target: { kind: 'surface', point: { p: [x, 0, 0] as [number, number, number], face: -1 } } }) as const
  const drawn = fakeClient({ snapDraw: async () => ({ status: 'ok', seam: lineSeam('drawn', 0, 50) }) })

  beforeEach(() => {
    useStore.setState({ seams: [lineSeam('a', 0, 200), lineSeam('b', 200, 300), lineSeam('c', 400, 500)] })
  })

  describe('draw', () => {
    it('adds an accepted seam, selects it, goes back to select and shows no notice', async () => {
      await chooseTool('draw', drawn)
      await toolEvent(click(0), drawn)
      await toolEvent(click(50), drawn)
      expect(state().tool).toMatchObject({ tool: 'draw' })
      await toolEvent({ type: 'finish' }, drawn)
      expect(state().tool).toEqual({ tool: 'select' })
      expect(ids()).toContain('drawn-1')
      expect(state().statusById['drawn-1']).toBe('accepted')
      expect(state().selectedId).toBe('drawn-1')
      expect(state().notice).toBeNull()
    })

    it('sends the clicks to the worker in order', async () => {
      let sent: unknown
      const client = fakeClient({
        snapDraw: async (clicks) => {
          sent = clicks
          return { status: 'ok', seam: lineSeam('drawn', 0, 50) }
        },
      })
      await chooseTool('draw', client)
      for (const x of [0, 20, 50]) await toolEvent(click(x), client)
      await toolEvent({ type: 'finish' }, client)
      expect(sent).toEqual([0, 20, 50].map((x) => ({ p: [x, 0, 0], face: -1 })))
    })

    it('shows the worker refusal, keeps the points so they can be corrected, and adds nothing', async () => {
      const error = { what: 'No seam was drawn.', why: 'The clicks are only 0.5 mm apart.', next: 'Click further apart along the joint.' }
      const client = fakeClient({ snapDraw: async () => ({ status: 'error', error }) })
      await chooseTool('draw', client)
      await toolEvent(click(0), client)
      await toolEvent(click(0.5), client)
      await toolEvent({ type: 'finish' }, client)
      expect(state().notice).toEqual(error)
      expect(state().tool).toEqual({ tool: 'draw', points: [expect.anything(), expect.anything()] })
      expect(state().manualSeams).toEqual([])
    })

    it('refuses a single point without calling the worker', async () => {
      let calls = 0
      const client = fakeClient({
        snapDraw: async () => {
          calls++
          return { status: 'ok', seam: lineSeam('drawn', 0, 50) }
        },
      })
      await chooseTool('draw', client)
      await toolEvent(click(0), client)
      await toolEvent({ type: 'finish' }, client)
      expect(calls).toBe(0)
      expect(state().notice?.what).toMatch(/No seam was drawn/)
    })

    it('a drawn seam is one undo step, and undo removes it from the list', async () => {
      await chooseTool('draw', drawn)
      await toolEvent(click(0), drawn)
      await toolEvent(click(50), drawn)
      await toolEvent({ type: 'finish' }, drawn)
      undoEdit()
      expect(ids()).toEqual(['a', 'b', 'c'])
      expect(state().selectedId).toBeNull()
      redoEdit()
      expect(ids()).toContain('drawn-1')
    })
  })

  describe('split', () => {
    it('needs a selected seam and says so', async () => {
      await chooseTool('split', none)
      expect(state().tool).toEqual({ tool: 'select' })
      expect(state().notice?.what).toMatch(/split/i)
    })

    it('splits the selected seam at the clicked arc length, selects the first piece and returns to select', async () => {
      state().select('a')
      await chooseTool('split', none)
      await toolEvent({ type: 'click', target: { kind: 'seam', id: 'a', s: 80 } }, none)
      expect(ids()).toEqual(['b', 'c', 'a/a', 'a/b'])
      expect(state().selectedId).toBe('a/a')
      expect(state().tool).toEqual({ tool: 'select' })
      undoEdit()
      expect(ids()).toEqual(['a', 'b', 'c'])
      redoEdit()
      expect(ids()).toEqual(['b', 'c', 'a/a', 'a/b'])
    })

    it('shows the refusal for a split too near an end and stays armed for another click', async () => {
      state().select('a')
      await chooseTool('split', none)
      await toolEvent({ type: 'click', target: { kind: 'seam', id: 'a', s: 1 } }, none)
      expect(state().notice?.why).toMatch(/shorter than 2 mm/)
      expect(state().tool).toEqual({ tool: 'split' })
      expect(ids()).toEqual(['a', 'b', 'c'])
    })
  })

  describe('merge', () => {
    it('merges the selected seam with the clicked one and returns to select', async () => {
      state().select('a')
      await chooseTool('merge', none)
      await toolEvent({ type: 'click', target: { kind: 'seam', id: 'b', s: 0 } }, none)
      expect(ids()).toEqual(['c', 'a+b'])
      expect(state().tool).toEqual({ tool: 'select' })
      undoEdit()
      expect(ids()).toEqual(['a', 'b', 'c'])
    })

    it('shows the refusal for seams that do not touch and stays armed', async () => {
      state().select('a')
      await chooseTool('merge', none)
      await toolEvent({ type: 'click', target: { kind: 'seam', id: 'c', s: 0 } }, none)
      expect(state().notice?.what).toBeTruthy()
      expect(state().tool).toEqual({ tool: 'merge', from: 'a' })
      expect(ids()).toEqual(['a', 'b', 'c'])
    })
  })

  describe('reverse, remove and trim', () => {
    it('reverse flips the selected seam and undo flips it back', () => {
      state().select('a')
      reverseSelected()
      expect(state().manualSeams.map((m) => m.id)).toEqual(['a~r'])
      undoEdit()
      expect(state().manualSeams).toEqual([])
    })

    it('reverse, remove and trim with nothing selected say what is missing', () => {
      for (const act of [reverseSelected, removeSelected, () => trimSelected('1', '1')]) {
        dismissNotice()
        act()
        expect(`${state().notice?.what} ${state().notice?.why}`).toMatch(/none is selected/)
        expect(state().manualSeams).toEqual([])
      }
    })

    it('remove refuses a detected seam with the store message and keeps it', () => {
      state().select('a')
      removeSelected()
      expect(state().notice?.what).toBe('Seam A cannot be deleted.')
      expect(ids()).toEqual(['a', 'b', 'c'])
    })

    it('remove deletes a manual seam and undo brings it back', () => {
      state().select('a')
      reverseSelected()
      state().select('a~r')
      removeSelected()
      expect(ids()).toEqual(['b', 'c'])
      expect(state().selectedId).toBeNull()
      undoEdit()
      expect(ids()).toEqual(['b', 'c', 'a~r'])
    })

    it('trim cuts the typed amounts from each end; empty means zero', () => {
      state().select('a')
      trimSelected('5', '3')
      expect(state().manualSeams[0]!.lengthMm).toBeCloseTo(192, 6)
      state().select(state().manualSeams[0]!.id)
      trimSelected('', '2')
      expect(state().manualSeams[0]!.lengthMm).toBeCloseTo(190, 6)
    })

    it('trim shows what was typed when it is not a number, and when the trim leaves nothing', () => {
      state().select('a')
      trimSelected('abc', '1')
      expect(state().notice?.why).toMatch(/abc/)
      trimSelected('150', '60')
      expect(state().notice?.what).toBeTruthy()
      expect(state().manualSeams).toEqual([])
    })
  })

  describe('notice and selection', () => {
    it('a successful edit clears an earlier notice', () => {
      state().select('a')
      removeSelected()
      expect(state().notice).not.toBeNull()
      reverseSelected()
      expect(state().notice).toBeNull()
    })

    it('dismissNotice clears it', () => {
      state().select('a')
      removeSelected()
      dismissNotice()
      expect(state().notice).toBeNull()
    })

    it('undo drops a selection that the undone edit created, and redo keeps working', () => {
      state().select('a')
      state().splitAt('a', 80)
      state().select('a/b')
      undoEdit()
      expect(state().selectedId).toBeNull()
      redoEdit()
      expect(ids()).toEqual(['b', 'c', 'a/a', 'a/b'])
    })

    it('undo keeps a selection that still exists', () => {
      state().select('b')
      state().toggleAccepted('b')
      undoEdit()
      expect(state().selectedId).toBe('b')
    })

    it('a stale selection counts as none when choosing a tool', async () => {
      useStore.setState({ selectedId: 'gone' })
      await chooseTool('merge', none)
      expect(state().tool).toEqual({ tool: 'select' })
      expect(state().notice?.what).toMatch(/merge/i)
    })

    it('loading a new part resets the tool and the notice', async () => {
      state().select('a')
      await chooseTool('merge', none)
      useStore.setState({ notice: { what: 'x', why: 'y', next: 'z' } })
      await importBuffer(buffer(), 'b.stl', fakeClient({ loadStl: async () => readyOutcome(), detect: async () => detected([]) }))
      expect(state().tool).toEqual({ tool: 'select' })
      expect(state().notice).toBeNull()
    })
  })
})

describe('torch flows', () => {
  const real = createGeometryApi()
  const torchClient = (overrides: Partial<GeometryApi> = {}) =>
    fakeClient({ torchPositions: real.torchPositions, torchPoses: real.torchPoses, ...overrides })
  // Normals chosen so that n1 x n2 runs along the travel direction, as detection writes them.
  const lineSeam = (id: string, from: [number, number, number], to: [number, number, number], n1: [number, number, number], n2: [number, number, number]): SeamCandidate => {
    const { points, lengthMm } = pointsFromPolyline([from, to], false, () => [n1, n2])
    return seam(id, 0.8, lengthMm, { points })
  }
  const flat = () => lineSeam('flat', [0, 0, 0], [100, 0, 0], [0, 0, 1], [0, -1, 0])
  const upright = () => lineSeam('upright', [0, 0, 0], [0, 0, 100], [1, 0, 0], [0, 1, 0])
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  let stop: () => void = () => {}
  afterEach(() => stop())

  describe('refreshPositions', () => {
    it('stores a summary for every seam, tied to the seam and the gravity it was worked out for', async () => {
      const seams = [flat(), upright()]
      useStore.setState({ seams })
      await refreshPositions(torchClient())
      expect(Object.keys(state().positionsById)).toEqual(['flat', 'upright'])
      expect(positionFor(state(), seams[1]!)?.code).toBe('PF')
      expect(state().positionsById.flat!.seam).toBe(seams[0])
    })

    it('includes manual seams and leaves out superseded detected ones', async () => {
      useStore.setState({ seams: [flat(), upright()], manualSeams: [seam('m', 0.8, 10, { points: flat().points })], supersededIds: ['upright'] })
      await refreshPositions(torchClient())
      expect(Object.keys(state().positionsById)).toEqual(['flat', 'm'])
    })

    it('clears the positions when there are no seams', async () => {
      useStore.setState({ seams: [flat()] })
      await refreshPositions(torchClient())
      useStore.setState({ seams: [] })
      await refreshPositions(torchClient())
      expect(state().positionsById).toEqual({})
    })

    it('shows the worker error and keeps what it had', async () => {
      useStore.setState({ seams: [flat()] })
      await refreshPositions(torchClient())
      const before = state().positionsById
      const error = { what: 'Welding positions failed.', why: 'The worker stopped.', next: 'Reload the page.' }
      await refreshPositions(torchClient({ torchPositions: async () => ({ status: 'error', error }) }))
      expect(state().notice).toEqual(error)
      expect(state().positionsById).toBe(before)
    })

    it('turns a throwing worker into a readable notice', async () => {
      useStore.setState({ seams: [flat()] })
      await refreshPositions(
        torchClient({
          torchPositions: async () => {
            throw new Error('boom')
          },
        }),
      )
      expect(state().notice?.what).toBeTruthy()
    })

    it('ignores an older answer that arrives after a newer one', async () => {
      const slow = deferred<Awaited<ReturnType<GeometryApi['torchPositions']>>>()
      let calls = 0
      const client = torchClient({
        torchPositions: (seams, gravity) => (++calls === 1 ? slow.promise : real.torchPositions(seams, gravity)),
      })
      const seams = [flat()]
      useStore.setState({ seams })
      const first = refreshPositions(client)
      state().setGravity([-1, 0, 0])
      await refreshPositions(client)
      const newest = state().positionsById.flat!.position.code
      slow.resolve({ status: 'ok', positions: { flat: { code: 'STALE', inclinationDeg: 0, rotationDeg: 0, shares: {} } } })
      await first
      expect(state().positionsById.flat!.position.code).toBe(newest)
      expect(positionFor(state(), seams[0]!)?.code).not.toBe('STALE')
    })
  })

  describe('startTorchSync', () => {
    it('works out positions when detection delivers seams', async () => {
      stop = startTorchSync(torchClient())
      useStore.setState({ seams: [flat(), upright()] })
      await vi.waitFor(() => expect(Object.keys(state().positionsById)).toEqual(['flat', 'upright']))
    })

    it('changes the positions with the gravity and does not detect again', async () => {
      let detects = 0
      const client = torchClient({
        detect: async () => {
          detects++
          return detected([])
        },
      })
      useStore.setState({ seams: [upright()] })
      stop = startTorchSync(client)
      await vi.waitFor(() => expect(state().positionsById.upright?.position.code).toBe('PF'))
      expect(changeGravity([-1, 0, 0])).toBeNull()
      await vi.waitFor(() => expect(state().positionsById.upright?.position.code).not.toBe('PF'))
      expect(detects).toBe(0)
    })

    it('never shows an answer for the old gravity once a second change is made, whichever answer comes last', async () => {
      // The first request is the one startTorchSync makes when it starts; each gravity change makes another.
      const gates = [deferred<void>(), deferred<void>(), deferred<void>()]
      let n = 0
      const client = torchClient({
        torchPositions: async (seams, gravity) => {
          await gates[n++]!.promise
          return real.torchPositions(seams, gravity)
        },
      })
      const seams = [upright()]
      useStore.setState({ seams })
      stop = startTorchSync(client)
      changeGravity([-1, 0, 0])
      await settle()
      changeGravity([0, 0, 1])
      await settle()
      gates[2]!.resolve()
      await vi.waitFor(() => expect(positionFor(state(), seams[0]!)).toBeDefined())
      const newest = positionFor(state(), seams[0]!)!.code
      gates[0]!.resolve()
      gates[1]!.resolve()
      await settle()
      await settle()
      expect(positionFor(state(), seams[0]!)?.code).toBe(newest)
      expect(state().positionsById.upright!.gravity).toEqual([0, 0, 1])
    })

    it('follows manual edits and their undo', async () => {
      useStore.setState({ seams: [flat()] })
      stop = startTorchSync(torchClient())
      await vi.waitFor(() => expect(Object.keys(state().positionsById)).toEqual(['flat']))
      state().splitAt('flat', 40)
      await vi.waitFor(() => expect(Object.keys(state().positionsById)).toEqual(['flat/a', 'flat/b']))
      undoEdit()
      await vi.waitFor(() => expect(Object.keys(state().positionsById)).toEqual(['flat']))
    })

    it('reversing a vertical seam flips climbing to descending: PF becomes PG', async () => {
      useStore.setState({ seams: [upright()] })
      stop = startTorchSync(torchClient())
      await vi.waitFor(() => expect(state().positionsById.upright?.position.code).toBe('PF'))
      state().select('upright')
      reverseSelected()
      await vi.waitFor(() => expect(Object.values(state().positionsById).map((e) => e.position.code)).toEqual(['PG']))
      undoEdit()
      await vi.waitFor(() => expect(Object.values(state().positionsById).map((e) => e.position.code)).toEqual(['PF']))
    })

    it('stops asking once it is stopped', async () => {
      let calls = 0
      const client = torchClient({
        torchPositions: async (seams, gravity) => {
          calls++
          return real.torchPositions(seams, gravity)
        },
      })
      stop = startTorchSync(client)
      stop()
      useStore.setState({ seams: [flat()] })
      await settle()
      expect(calls).toBe(0)
    })

    it('does not ask again when only the status of a seam changes', async () => {
      let calls = 0
      const client = torchClient({
        torchPositions: async (seams, gravity) => {
          calls++
          return real.torchPositions(seams, gravity)
        },
      })
      useStore.setState({ seams: [flat()] })
      stop = startTorchSync(client)
      await vi.waitFor(() => expect(calls).toBe(1))
      state().toggleAccepted('flat')
      state().select('flat')
      await settle()
      expect(calls).toBe(1)
    })
  })

  describe('poses of the selected seam', () => {
    it('are worked out for the selected seam, reset the scrub, and are dropped with the selection', async () => {
      const seams = [flat(), upright()]
      useStore.setState({ seams })
      stop = startTorchSync(torchClient())
      state().setScrub(30)
      state().select('flat')
      await vi.waitFor(() => expect(posesFor(state(), seams[0]!)).not.toBeNull())
      expect(state().scrubS).toBe(0)
      expect(posesFor(state(), seams[0]!)!.length).toBeGreaterThan(1)

      state().select(null)
      await vi.waitFor(() => expect(state().posesForSelected).toBeNull())
    })

    it('ignore an older answer for a seam that is no longer selected', async () => {
      const seams = [flat(), upright()]
      const gates = [deferred<void>(), deferred<void>()]
      let n = 0
      const client = torchClient({
        torchPoses: async (seam, params) => {
          await gates[n++]!.promise
          return real.torchPoses(seam, params)
        },
      })
      useStore.setState({ seams })
      stop = startTorchSync(client)
      state().select('flat')
      await settle()
      state().select('upright')
      await settle()
      gates[1]!.resolve()
      await vi.waitFor(() => expect(state().posesForSelected?.seam).toBe(seams[1]))
      gates[0]!.resolve()
      await settle()
      await settle()
      expect(state().posesForSelected?.seam).toBe(seams[1])
    })

    it('come back for the edited seam after a reverse, and the scrub starts again at the start', async () => {
      useStore.setState({ seams: [flat()] })
      stop = startTorchSync(torchClient())
      state().select('flat')
      await vi.waitFor(() => expect(state().posesForSelected).not.toBeNull())
      state().setScrub(60)
      reverseSelected()
      await vi.waitFor(() => expect(state().posesForSelected?.seam.id).toBe('flat~r'))
      expect(state().scrubS).toBe(0)
    })

    it('refreshPoses with nothing selected clears them', async () => {
      useStore.setState({ seams: [flat()], posesForSelected: { seam: flat(), poses: [] } })
      await refreshPoses(torchClient())
      expect(state().posesForSelected).toBeNull()
    })

    it('shows a worker error as a notice', async () => {
      useStore.setState({ seams: [flat()], selectedId: 'flat' })
      const error = { what: 'Torch poses failed.', why: 'The worker stopped.', next: 'Reload the page.' }
      await refreshPoses(torchClient({ torchPoses: async () => ({ status: 'error', error }) }))
      expect(state().notice).toEqual(error)
    })
  })

  describe('changeGravity', () => {
    it('sets the gravity and clears any earlier notice', () => {
      useStore.setState({ notice: { what: 'x', why: 'y', next: 'z' } })
      expect(changeGravity([0, 0, 1])).toBeNull()
      expect(state().gravity).toEqual([0, 0, 1])
      expect(state().notice).toBeNull()
    })

    it('refuses a zero or non finite vector with a notice and keeps the gravity', () => {
      changeGravity([1, 0, 0])
      const refusal = changeGravity([0, 0, 0])
      expect(refusal).not.toBeNull()
      expect(state().notice).toEqual(refusal)
      expect(state().gravity).toEqual([1, 0, 0])
    })
  })
})

