import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SeamReach } from '../../../src/core/snake/reach'
import { AUTOSAVE_DELAY_MS, startAutosave, startFresh, type PlanStorage } from '../../../src/state/autosave'
import { DEMO_PORT, DEMO_PROCEDURE, DEMO_SAMPLE, DEMO_SEAM_ID, DEMO_STATION_MM } from '../../../src/state/demo'
import { openDeepLink } from '../../../src/state/deepLinkFlow'
import { savedKey, snapshotOf } from '../../../src/state/savedPlan'
import { useStore } from '../../../src/state/store'
import { createGeometryApi, type GeometryApi } from '../../../src/worker/geometry.api'
import { resetStore } from '../helpers/state'

const state = () => useStore.getState()
const SAMPLES = fileURLToPath(new URL('../../../public/samples/', import.meta.url))

function serve() {
  const urls: string[] = []
  const fetchFn = async (url: string): Promise<Response> => {
    urls.push(url)
    const file = url.split('/').pop()!
    try {
      return new Response(readFileSync(`${SAMPLES}${file}`))
    } catch {
      return new Response('not found', { status: 404 })
    }
  }
  return { urls, fetchFn, sampleFetches: () => urls.filter((u) => !u.endsWith('manifest.json')) }
}

// The real worker api, with reach answered instantly so a test does not wait the 12 s the tank takes.
function client() {
  const api = createGeometryApi()
  const reached: string[][] = []
  const stub: GeometryApi = {
    ...api,
    reach: async (seams) => {
      reached.push(seams.map((s) => s.id))
      const result: SeamReach = { portId: 'P1', coverage: 1, unreachable: [], stations: [{ s: 0, ok: true, chain: { joints: [[0, 0, 0], [0, 0, -100]] } }] }
      return { status: 'ok', results: Object.fromEntries(seams.map((s) => [s.id, result])), ms: 1 }
    },
  }
  return { stub, reached }
}

function expectReadable(error: { what: string; why: string; next: string }) {
  for (const part of [error.what, error.why, error.next]) expect(part.trim().length).toBeGreaterThan(0)
  expect(`${error.what}${error.why}${error.next}`).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`))
}

beforeEach(resetStore)

describe('openDeepLink: a sample id that is not in the manifest', () => {
  it.each(['nope', '../../x', '', '%2e%2e/secret', 'tank-with-manhole.stl'])('refuses %j without fetching any sample file', async (id) => {
    const { urls, fetchFn, sampleFetches } = serve()
    const error = await openDeepLink({ sample: id, demo: false }, client().stub, fetchFn)
    expect(error).not.toBeNull()
    expectReadable(error!)
    expect(error!.what).toBe(`The sample "${id}" was not found.`)
    expect(error!.why).toBe('The link names a sample this build does not have.')
    expect(error!.next).toMatch(/^Pick one of .*tank-with-manhole.* on the start screen, or remove \?sample from the address\.$/)
    expect(urls).toEqual(['/samples/manifest.json'])
    expect(sampleFetches()).toEqual([])
    expect(state().importState).toMatchObject({ phase: 'error' })
    expect(state().part).toBeNull()
  })

  it('shows the error in the banner state so the person sees it', async () => {
    const { fetchFn } = serve()
    await openDeepLink({ sample: 'nope', demo: false }, client().stub, fetchFn)
    const shown = state().importState
    expect(shown.phase === 'error' && shown.error.what).toContain('was not found')
  })
})

describe('openDeepLink: nothing to open', () => {
  it('does nothing and fetches nothing without a sample or demo', async () => {
    const { urls, fetchFn } = serve()
    expect(await openDeepLink({ sample: null, demo: false }, client().stub, fetchFn)).toBeNull()
    expect(urls).toEqual([])
  })

  it('says what demo needs when it comes without a sample', async () => {
    const { urls, fetchFn } = serve()
    expect(await openDeepLink({ sample: null, demo: true }, client().stub, fetchFn)).toBeNull()
    expect(urls).toEqual([])
    expect(state().part).toBeNull()
    expect(state().notice).not.toBeNull()
    expectReadable(state().notice!)
    expect(state().notice!.next).toContain(`?sample=${DEMO_SAMPLE}&demo=1`)
  })
})

describe('openDeepLink: a sample without demo', () => {
  it('loads it and changes nothing else', async () => {
    const { fetchFn } = serve()
    expect(await openDeepLink({ sample: 't-joint-merged', demo: false }, client().stub, fetchFn)).toBeNull()
    expect(state().part?.name).toBe('t-joint-merged.stl')
    expect(state().activeStep).toBe('seams')
    expect(Object.values(state().statusById)).toEqual([])
    expect(state().ports).toEqual([])
    expect(state().notice).toBeNull()
  })
})

describe('openDeepLink: demo on another sample', () => {
  it('loads the sample normally and shows a readable notice that the demo is only for the tank', async () => {
    const { fetchFn } = serve()
    expect(await openDeepLink({ sample: 't-joint-merged', demo: true }, client().stub, fetchFn)).toBeNull()
    expect(state().part?.name).toBe('t-joint-merged.stl')
    expect(Object.values(state().statusById)).toEqual([])
    expect(state().ports).toEqual([])
    expect(state().notice).not.toBeNull()
    expectReadable(state().notice!)
    expect(state().notice!.what).toContain('demo')
    expect(state().notice!.next).toContain(DEMO_SAMPLE)
  })
})

describe('openDeepLink: the tank demo', () => {
  it('accepts every seam, assigns the spray procedure, places port P1, measures reach and lands on the snake seam', async () => {
    const { fetchFn } = serve()
    const { stub, reached } = client()
    expect(await openDeepLink({ sample: DEMO_SAMPLE, demo: true }, stub, fetchFn)).toBeNull()

    const accepted = Object.entries(state().statusById).filter(([, status]) => status === 'accepted')
    expect(accepted).toHaveLength(21)
    for (const [id] of accepted) expect(state().procedureById[id]).toBe(DEMO_PROCEDURE)
    expect(state().ports).toEqual([expect.objectContaining({ id: 'P1', position: DEMO_PORT.position, direction: DEMO_PORT.direction })])
    expect(state().activeStep).toBe('access')
    expect(state().selectedId).toBe(DEMO_SEAM_ID)
    expect(state().selectedIds).toEqual([DEMO_SEAM_ID])
    expect(state().scrubS).toBe(DEMO_STATION_MM)
    // The arm is inside the tank, so the part is shown see-through.
    expect(state().xray).toBe(true)
    expect(reached).toHaveLength(20)
    expect(state().info).toMatch(/Reach measured for 20 seams/)
    expect(state().offer).toBeNull()
  }, 120_000)

  it('names the demo seam by the label S16 and the station inside it', async () => {
    const { fetchFn } = serve()
    await openDeepLink({ sample: DEMO_SAMPLE, demo: true }, client().stub, fetchFn)
    const seam = state().seams.find((s) => s.id === DEMO_SEAM_ID)
    expect(seam?.label).toBe('S16')
    expect(seam!.lengthMm).toBeGreaterThan(DEMO_STATION_MM)
  }, 120_000)
})

describe('openDeepLink: a returning visitor with a saved plan', () => {
  // A plan saved for the tank in an earlier visit: one seam accepted. Leaves the store empty again.
  async function savedTankPlan() {
    const { fetchFn } = serve()
    await openDeepLink({ sample: DEMO_SAMPLE, demo: false }, client().stub, fetchFn)
    useStore.setState({ statusById: { [state().seams[0]!.id]: 'accepted' } })
    const saved = JSON.parse(JSON.stringify(snapshotOf(state(), '2026-11-04T10:15:00.000Z'))) as unknown
    const key = savedKey(state().part!.sha256)
    resetStore()
    const data = new Map<string, unknown>([[key, saved]])
    const writes: string[] = []
    const storage: PlanStorage = {
      get: async (k) => data.get(k),
      set: async (k, v) => {
        writes.push(k)
        data.set(k, v)
      },
    }
    return { fetchFn, saved, key, data, writes, storage }
  }

  it('opens the demo without the restore question and leaves the saved plan as it was', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { fetchFn, saved, key, data, writes, storage } = await savedTankPlan()
      const stop = startAutosave(storage)
      try {
        await openDeepLink({ sample: DEMO_SAMPLE, demo: true }, client().stub, fetchFn)
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3)
        expect(state().offer).toBeNull()
        expect(Object.values(state().statusById).filter((status) => status === 'accepted')).toHaveLength(21)
        expect(writes).toEqual([])
        expect(data.get(key)).toBe(saved)
        expect(state().notice?.what).toBe('Autosave is paused for this demo.')
      } finally {
        stop()
      }
    } finally {
      vi.useRealTimers()
    }
  }, 120_000)

  it('ends the demo when its sample does not load, so the next part is offered its plan and autosaved', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { fetchFn, writes, storage } = await savedTankPlan()
      const failing = async (url: string) => (url.endsWith('.stl') ? new Response('gone', { status: 500 }) : fetchFn(url))
      const stop = startAutosave(storage)
      try {
        await openDeepLink({ sample: DEMO_SAMPLE, demo: true }, client().stub, failing)
        expect(state().part).toBeNull()
        await openDeepLink({ sample: DEMO_SAMPLE, demo: false }, client().stub, fetchFn)
        expect(state().offer, 'the restore question for the next part').not.toBeNull()
        startFresh()
        state().toggleAccepted(state().seams[1]!.id)
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3)
        expect(writes.length, 'the edit was saved').toBeGreaterThan(0)
      } finally {
        stop()
      }
    } finally {
      vi.useRealTimers()
    }
  }, 120_000)

  it('still offers the restore for the same sample opened without demo', async () => {
    const { fetchFn, storage } = await savedTankPlan()
    const stop = startAutosave(storage)
    try {
      await openDeepLink({ sample: DEMO_SAMPLE, demo: false }, client().stub, fetchFn)
      expect(state().offer).not.toBeNull()
    } finally {
      stop()
    }
  }, 120_000)
})
