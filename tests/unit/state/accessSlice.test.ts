import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SeamAccess } from '../../../src/core/job/schema'
import type { AccessAnalysis } from '../../../src/core/access/clearance'
import { ACCESS_DEBOUNCE_MS, chooseUnits, exportPlan, importBuffer, startAccessSync } from '../../../src/state/flows'
import { accessFor, stationsFor } from '../../../src/state/accessSlice'
import { selectPlan } from '../../../src/state/selectors'
import { useStore } from '../../../src/state/store'
import { buildJob } from '../../../src/core/job/build'
import type { AccessOutcome } from '../../../src/worker/geometry.api'
import { CREATED_AT, samplePlan, SPRAY_ID } from '../helpers/jobs'
import { detected, deferred, fakeClient, partInfo, readyOutcome, resetStore, seam } from '../helpers/state'

const state = () => useStore.getState()

const standard: SeamAccess = { clearanceDeg: 45, nearClearanceDeg: 45, class: 'standard', portId: null, reachCoverage: null, unreachable: [] }
const analysis = (access: SeamAccess = standard): AccessAnalysis => ({ access, stations: [{ s: 0, clearanceDeg: 45, nearClearanceDeg: 45 }] })

function accessAnswer(requested: { id: string }[], access: SeamAccess = standard): AccessOutcome {
  return { status: 'ok', results: Object.fromEntries(requested.map((s) => [s.id, analysis(access)])), ms: 1 }
}

// The t-joint sample as store state with its seams accepted and the spray procedure assigned.
function loadSeams() {
  const plan = samplePlan('t-joint-merged')
  useStore.setState({
    part: partInfo({ ...plan.part, sourceUnits: 'mm' }),
    seams: plan.seams.map((p) => p.seam),
    statusById: Object.fromEntries(plan.seams.map((p) => [p.seam.id, 'accepted' as const])),
    procedureById: Object.fromEntries(plan.seams.map((p) => [p.seam.id, SPRAY_ID])),
  })
  return plan
}

beforeEach(resetStore)

describe('access slice', () => {
  it('starts empty and returns nothing for a seam it has not analysed', () => {
    expect(state().accessById).toEqual({})
    expect(accessFor(state(), seam('a'))).toBeNull()
  })

  it('returns the answer for the points it was computed for, and ignores it once the points change', () => {
    const a = seam('a')
    state().mergeAccess({ a: { ...analysis(), points: a.points } })
    expect(accessFor(state(), a)).toEqual(standard)
    expect(stationsFor(state(), a)).toHaveLength(1)
    const edited = { ...a, points: [...a.points] }
    expect(accessFor(state(), edited)).toBeNull()
    expect(stationsFor(state(), edited)).toBeNull()
  })

  it('keeps the other answers when it merges new ones, and replaces the maps rather than mutating them', () => {
    const a = seam('a')
    const b = seam('b')
    state().mergeAccess({ a: { ...analysis(), points: a.points } })
    const before = state().accessById
    state().mergeAccess({ b: { ...analysis({ ...standard, class: 'slim' }), points: b.points } })
    expect(Object.keys(state().accessById)).toEqual(['a', 'b'])
    expect(state().accessById).not.toBe(before)
    expect(before).toEqual({ a: standard })
  })

  it('clears every map', () => {
    const a = seam('a')
    state().mergeAccess({ a: { ...analysis(), points: a.points } })
    state().clearAccess()
    expect([state().accessById, state().stationsById, state().accessPointsById]).toEqual([{}, {}, {}])
  })

  it('is not undo history', () => {
    const a = seam('a')
    const past = useStore.temporal.getState().pastStates.length
    state().mergeAccess({ a: { ...analysis(), points: a.points } })
    state().setAccessBusy(true)
    expect(useStore.temporal.getState().pastStates.length).toBe(past)
  })

  it('is cleared when a part is loaded and when the units are chosen', async () => {
    state().mergeAccess({ a: { ...analysis(), points: seam('a').points } })
    await importBuffer(new ArrayBuffer(8), 'a.stl', fakeClient({ loadStl: async () => readyOutcome(), detect: async () => detected([]) }))
    expect(state().accessById).toEqual({})

    state().mergeAccess({ a: { ...analysis(), points: seam('a').points } })
    useStore.setState({ importState: { phase: 'needs-units', fileName: 'a.stl', maxDimension: 7, guess: 'in' } })
    await chooseUnits('in', fakeClient({ setUnits: async () => readyOutcome({ sourceUnits: 'in', scaleToMm: 25.4 }), detect: async () => detected([]) }))
    expect(state().accessById).toEqual({})
  })

  it('puts the answer into the plan for a seam and leaves it null for one without', () => {
    const plan = loadSeams()
    const [first, second] = plan.seams
    state().mergeAccess({ [first!.seam.id]: { ...analysis({ ...standard, class: 'snake' }), points: first!.seam.points } })
    const planned = selectPlan(state()).seams
    expect(planned.find((p) => p.seam.id === first!.seam.id)!.access).toMatchObject({ class: 'snake' })
    expect(planned.find((p) => p.seam.id === second!.seam.id)!.access).toBeNull()
  })
})

describe('startAccessSync', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('asks once, after the plan has been still, for the accepted seams without a fresh answer', async () => {
    const calls: string[][] = []
    const stop = startAccessSync(fakeClient({ access: async (seams) => (calls.push(seams.map((s) => s.id)), accessAnswer(seams)) }))
    const plan = loadSeams()
    await vi.advanceTimersByTimeAsync(ACCESS_DEBOUNCE_MS - 1)
    expect(calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toEqual([plan.seams.map((p) => p.seam.id)])
    expect(Object.keys(state().accessById).sort()).toEqual(plan.seams.map((p) => p.seam.id).sort())
    expect(state().accessBusy).toBe(false)
    stop()
  })

  it('does not ask again for seams that already have a fresh answer', async () => {
    const access = vi.fn(async (seams: { id: string }[]) => accessAnswer(seams))
    const stop = startAccessSync(fakeClient({ access }))
    loadSeams()
    await vi.advanceTimersByTimeAsync(ACCESS_DEBOUNCE_MS)
    access.mockClear()
    state().hover('x')
    state().assignProcedure(Object.keys(state().statusById), SPRAY_ID)
    await vi.advanceTimersByTimeAsync(ACCESS_DEBOUNCE_MS * 2)
    expect(access).not.toHaveBeenCalled()
    stop()
  })

  it('ignores a stale answer and asks again for the seam whose points changed', async () => {
    const calls: string[][] = []
    const stop = startAccessSync(fakeClient({ access: async (seams) => (calls.push(seams.map((s) => s.id)), accessAnswer(seams)) }))
    const plan = loadSeams()
    await vi.advanceTimersByTimeAsync(ACCESS_DEBOUNCE_MS)
    calls.length = 0

    const edited = plan.seams[0]!.seam
    useStore.setState({ seams: state().seams.map((s) => (s.id === edited.id ? { ...s, points: [...s.points] } : s)) })
    expect(accessFor(state(), state().seams.find((s) => s.id === edited.id)!)).toBeNull()
    await vi.advanceTimersByTimeAsync(ACCESS_DEBOUNCE_MS)
    expect(calls).toEqual([[edited.id]])
    expect(accessFor(state(), state().seams.find((s) => s.id === edited.id)!)).toEqual(standard)
    stop()
  })

  it('asks for accepted seams only, and not at all without a part', async () => {
    const access = vi.fn(async (seams: { id: string }[]) => accessAnswer(seams))
    const stop = startAccessSync(fakeClient({ access }))
    useStore.setState({ seams: [seam('a')], statusById: { a: 'accepted' } })
    await vi.advanceTimersByTimeAsync(ACCESS_DEBOUNCE_MS)
    expect(access).not.toHaveBeenCalled()

    useStore.setState({ part: partInfo(), statusById: { a: 'rejected' } })
    await vi.advanceTimersByTimeAsync(ACCESS_DEBOUNCE_MS)
    expect(access).not.toHaveBeenCalled()
    stop()
  })

  it('drops the answer of an older request when a newer one is running', async () => {
    const first = deferred<AccessOutcome>()
    const second = deferred<AccessOutcome>()
    const gates = [first, second]
    let n = 0
    const stop = startAccessSync(fakeClient({ access: () => gates[n++]!.promise }))
    const plan = loadSeams()
    await vi.advanceTimersByTimeAsync(ACCESS_DEBOUNCE_MS)
    useStore.setState({ seams: state().seams.map((s) => ({ ...s, points: [...s.points] })) })
    await vi.advanceTimersByTimeAsync(ACCESS_DEBOUNCE_MS)
    first.resolve(accessAnswer(plan.seams.map((p) => p.seam), { ...standard, class: 'blocked' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(state().accessById).toEqual({})
    second.resolve(accessAnswer(plan.seams.map((p) => p.seam)))
    await vi.advanceTimersByTimeAsync(0)
    expect(Object.values(state().accessById).map((a) => a.class)).toEqual(plan.seams.map(() => 'standard'))
    stop()
  })

  it('shows a worker error as a notice and leaves the slice alone', async () => {
    const error = { what: 'The access check failed.', why: 'The worker stopped.', next: 'Reload the page.' }
    const stop = startAccessSync(fakeClient({ access: async () => ({ status: 'error', error }) }))
    loadSeams()
    await vi.advanceTimersByTimeAsync(ACCESS_DEBOUNCE_MS)
    expect(state().notice).toEqual(error)
    expect(state().accessById).toEqual({})
    expect(state().accessBusy).toBe(false)
    stop()
  })
})

describe('export waits for access', () => {
  it('runs the access check for accepted seams that lack an answer, and exports their class', async () => {
    loadSeams()
    const exported: unknown[] = []
    const client = fakeClient({
      access: async (seams) => accessAnswer(seams, { ...standard, class: 'slim', nearClearanceDeg: 40 }),
      exportJob: async (sent) => (exported.push(sent), { status: 'ok', job: buildJob(sent, { createdAt: CREATED_AT }), issues: [] }),
    })
    const save = vi.fn()
    await exportPlan(client, save, () => CREATED_AT)
    expect(save).toHaveBeenCalledTimes(1)
    const sent = exported[0] as ReturnType<typeof selectPlan>
    expect(sent.seams.every((p) => p.access?.class === 'slim')).toBe(true)
    const job = JSON.parse(save.mock.calls[0]![1] as string)
    expect(job.seams.every((s: { access: SeamAccess }) => s.access.class === 'slim' && s.access.nearClearanceDeg === 40)).toBe(true)
  })

  it('stops with the worker error when the access check fails', async () => {
    loadSeams()
    const error = { what: 'The access check failed.', why: 'The worker stopped.', next: 'Reload the page.' }
    const save = vi.fn()
    await exportPlan(fakeClient({ access: async () => ({ status: 'error', error }) }), save, () => CREATED_AT)
    expect(save).not.toHaveBeenCalled()
    const phase = state().importState
    expect(phase.phase === 'error' && phase.error.what).toBe(error.what)
  })
})
