import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importBuffer } from '../../../src/state/flows'
import { AUTOSAVE_DELAY_MS, restoreSaved, startAutosave, startFresh, type PlanStorage } from '../../../src/state/autosave'
import { savedKey, snapshotOf } from '../../../src/state/savedPlan'
import { useStore } from '../../../src/state/store'
import { detected, fakeClient, partInfo, readyOutcome, resetStore, seam } from '../helpers/state'

const state = () => useStore.getState()
const SHA = 'a'.repeat(64)
const KEY = savedKey(SHA)

function memoryStorage(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial))
  const sets: Array<[string, unknown]> = []
  const storage: PlanStorage = {
    get: async (key) => data.get(key),
    set: async (key, value) => {
      sets.push([key, value])
      data.set(key, value)
    },
  }
  return { storage, data, sets }
}

function loadedPart() {
  useStore.setState({ part: partInfo(), seams: [seam('a'), seam('b'), seam('c')] })
}

const savedSnapshot = (savedAt = '2026-11-04T10:15:00.000Z') => {
  useStore.setState({
    part: partInfo(),
    statusById: { a: 'accepted', b: 'accepted', c: 'rejected' },
    typeById: { c: 'lap' },
    procedureById: { a: 'WPS-GMAW-SPRAY-FW6' },
    legById: { a: 6 },
    nextDrawnId: 4,
    gravity: [0, 1, 0],
    detectSettings: { creaseAngleDeg: 25 },
    jobSettings: { poseSpacingMm: 9, airSpeedMmS: 200, approachMm: 60 },
  })
  const snapshot = JSON.parse(JSON.stringify(snapshotOf(state(), savedAt)))
  resetStore()
  return snapshot
}

const loadClient = (extra = {}) =>
  fakeClient({ loadStl: async () => readyOutcome(), detect: async () => detected([seam('a'), seam('b'), seam('c')]), ...extra })

beforeEach(() => {
  resetStore()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('startAutosave: saving', () => {
  it('saves a change once, 1000 ms later, under weld-plan:<sha256>', async () => {
    const { storage, sets } = memoryStorage()
    loadedPart()
    const stop = startAutosave(storage)
    state().toggleAccepted('a')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1)
    expect(sets).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(sets).toHaveLength(1)
    expect(sets[0]![0]).toBe(KEY)
    expect(sets[0]![1]).toMatchObject({ version: 1, sha256: SHA, statusById: { a: 'accepted' } })
    stop()
  })

  it('saves three quick changes once, with the last of them', async () => {
    const { storage, sets } = memoryStorage()
    loadedPart()
    const stop = startAutosave(storage)
    state().toggleAccepted('a')
    await vi.advanceTimersByTimeAsync(300)
    state().toggleAccepted('b')
    await vi.advanceTimersByTimeAsync(300)
    state().toggleAccepted('c')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(sets).toHaveLength(1)
    expect(Object.keys((sets[0]![1] as { statusById: object }).statusById)).toEqual(['a', 'b', 'c'])
    stop()
  })

  it('does not save hover, selection or a part load', async () => {
    const { storage, sets } = memoryStorage()
    const stop = startAutosave(storage)
    await importBuffer(new ArrayBuffer(8), 'a.stl', loadClient())
    state().select('a')
    state().hover('a')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3)
    expect(sets).toHaveLength(0)
    stop()
  })

  it('stops saving once stopped', async () => {
    const { storage, sets } = memoryStorage()
    loadedPart()
    startAutosave(storage)()
    state().toggleAccepted('a')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(sets).toHaveLength(0)
  })

  it('says once that autosave is off when the storage refuses, and does not retry', async () => {
    const set = vi.fn(async () => {
      throw new Error('quota exceeded')
    })
    loadedPart()
    const stop = startAutosave({ get: async () => undefined, set })
    state().toggleAccepted('a')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(set).toHaveBeenCalledTimes(1)
    expect(state().notice?.what).toMatch(/^Autosave is off/)
    expect(state().notice?.why).toContain('quota exceeded')
    state().setNotice(null)
    state().toggleAccepted('b')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(set).toHaveBeenCalledTimes(1)
    expect(state().notice).toBeNull()
    stop()
  })
})

describe('the restore offer', () => {
  it('opens when a part loads that has a stored entry, and nothing saves while it is open', async () => {
    const { storage, sets } = memoryStorage({ [KEY]: savedSnapshot() })
    const stop = startAutosave(storage)
    await importBuffer(new ArrayBuffer(8), 'a.stl', loadClient())
    expect(state().offer).toMatchObject({ partName: 'a.stl', sha256: SHA, savedAt: '2026-11-04T10:15:00.000Z' })
    state().toggleAccepted('b')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(sets).toHaveLength(0)
    stop()
  })

  it('does not open when the part has no entry', async () => {
    const stop = startAutosave(memoryStorage().storage)
    await importBuffer(new ArrayBuffer(8), 'a.stl', loadClient())
    expect(state().offer).toBeNull()
    stop()
  })

  it('does not open for an entry of another part', async () => {
    const stop = startAutosave(memoryStorage({ [KEY]: { ...savedSnapshot(), sha256: 'b'.repeat(64) } }).storage)
    await importBuffer(new ArrayBuffer(8), 'a.stl', loadClient())
    expect(state().offer).toBeNull()
    stop()
  })

  it.each([
    ['a corrupt entry', 'garbage'],
    ['a version 2 entry', { ...savedSnapshot(), version: 2 }],
  ])('gives a notice and no offer for %s', async (_name, entry) => {
    const stop = startAutosave(memoryStorage({ [KEY]: entry }).storage)
    await importBuffer(new ArrayBuffer(8), 'a.stl', loadClient())
    expect(state().offer).toBeNull()
    expect(state().notice?.what).toMatch(/saved plan/i)
    stop()
  })

  it('gives a notice when the storage cannot be read', async () => {
    const stop = startAutosave({
      get: async () => {
        throw new Error('blocked')
      },
      set: async () => {},
    })
    await importBuffer(new ArrayBuffer(8), 'a.stl', loadClient())
    expect(state().offer).toBeNull()
    expect(state().notice?.why).toContain('blocked')
    stop()
  })

  it('closes the offer of the previous part when another part loads', async () => {
    const stop = startAutosave(memoryStorage({ [KEY]: savedSnapshot() }).storage)
    await importBuffer(new ArrayBuffer(8), 'a.stl', loadClient())
    expect(state().offer).not.toBeNull()
    await importBuffer(new ArrayBuffer(8), 'b.stl', loadClient({ loadStl: async () => readyOutcome({ sha256: 'c'.repeat(64), name: 'b.stl' }) }))
    expect(state().offer).toBeNull()
    stop()
  })
})

describe('restoreSaved and startFresh', () => {
  async function offered(extra: { detect?: ReturnType<typeof vi.fn> } = {}) {
    const memory = memoryStorage({ [KEY]: savedSnapshot() })
    const stop = startAutosave(memory.storage)
    const detect = extra.detect ?? vi.fn(async () => detected([seam('a'), seam('b'), seam('c')]))
    const client = loadClient({ detect })
    await importBuffer(new ArrayBuffer(8), 'a.stl', client)
    return { ...memory, stop, client, detect }
  }

  it('puts every saved field back, empties the undo history and closes the offer', async () => {
    const { stop, client } = await offered()
    state().toggleAccepted('c')
    expect(useStore.temporal.getState().pastStates.length).toBeGreaterThan(0)
    await restoreSaved(client)
    expect(state()).toMatchObject({
      statusById: { a: 'accepted', b: 'accepted', c: 'rejected' },
      typeById: { c: 'lap' },
      procedureById: { a: 'WPS-GMAW-SPRAY-FW6' },
      legById: { a: 6 },
      nextDrawnId: 4,
      gravity: [0, 1, 0],
      detectSettings: { creaseAngleDeg: 25 },
      jobSettings: { poseSpacingMm: 9, airSpeedMmS: 200, approachMm: 60 },
      offer: null,
    })
    expect(useStore.temporal.getState().pastStates).toHaveLength(0)
    stop()
  })

  it('detects again at the saved crease angle before it applies the plan', async () => {
    const angles: number[] = []
    const detect = vi.fn(async (settings: { creaseAngleDeg: number }) => {
      angles.push(settings.creaseAngleDeg)
      return detected([seam('a'), seam('b'), seam('c')])
    })
    const { stop, client } = await offered({ detect })
    angles.length = 0
    await restoreSaved(client)
    expect(angles).toEqual([25])
    stop()
  })

  it('does not save the restore itself', async () => {
    const { stop, client, sets } = await offered()
    await restoreSaved(client)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(sets).toHaveLength(0)
    stop()
  })

  it('saves the next change after a restore', async () => {
    const { stop, client, sets } = await offered()
    await restoreSaved(client)
    state().toggleAccepted('c')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(sets).toHaveLength(1)
    stop()
  })

  it('keeps the entry on start fresh, and overwrites it at the next change', async () => {
    const { stop, data, sets } = await offered()
    const before = data.get(KEY)
    startFresh()
    expect(state().offer).toBeNull()
    expect(state().statusById).toEqual({})
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(sets).toHaveLength(0)
    expect(data.get(KEY)).toBe(before)
    state().toggleAccepted('a')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(sets).toHaveLength(1)
    expect(data.get(KEY)).not.toBe(before)
    stop()
  })

  it('leaves the offer open when detection fails during a restore', async () => {
    const failing = vi.fn(async () => ({ status: 'error' as const, error: { what: 'w', why: 'y', next: 'n' } }))
    const { stop, client } = await offered()
    const broken = { ...client, detect: failing }
    await restoreSaved(broken)
    expect(state().offer).not.toBeNull()
    expect(state().statusById).toEqual({})
    stop()
  })
})
