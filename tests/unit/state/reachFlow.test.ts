import { beforeEach, describe, expect, it } from 'vitest'
import type { SeamCandidate } from '../../../src/core/seams/detect'
import { reachKey, type SeamReach } from '../../../src/core/snake/reach'
import { cancelReach, insertSelected, reachTargets, runReach, runStaleReach, staleReachSeams } from '../../../src/state/reachFlow'
import { reachFor } from '../../../src/state/reachSlice'
import { useStore } from '../../../src/state/store'
import type { ReachOutcome } from '../../../src/worker/geometry.api'
import { loadSnakeSeams, reachOf, SNAKE } from '../helpers/reach'
import { deferred, fakeClient, resetStore } from '../helpers/state'

const state = () => useStore.getState()

function reachAnswer(requested: SeamCandidate[], coverage = 0.5): ReachOutcome {
  return { status: 'ok', results: Object.fromEntries(requested.map((s) => [s.id, reachOf(coverage)])), ms: 1 }
}

function expectReadable(error: { what: string; why: string; next: string }) {
  for (const part of [error.what, error.why, error.next]) expect(part.trim().length).toBeGreaterThan(0)
  expect(`${error.what}${error.why}${error.next}`).not.toMatch(new RegExp('[\\u2013\\u2014]'))
}

beforeEach(resetStore)

describe('reachTargets', () => {
  it('is every accepted snake seam when nothing is selected', () => {
    const seams = loadSnakeSeams()
    state().mergeAccess({ [seams[0]!.id]: { access: { ...SNAKE, class: 'standard' }, stations: [], points: seams[0]!.points } })
    expect(reachTargets(state()).map((s) => s.id)).toEqual(seams.slice(1).map((s) => s.id))
  })

  it('is the selected seams when there is a selection, whatever their class', () => {
    const seams = loadSnakeSeams()
    state().mergeAccess({ [seams[0]!.id]: { access: { ...SNAKE, class: 'standard' }, stations: [], points: seams[0]!.points } })
    useStore.setState({ selectedIds: [seams[0]!.id], selectedId: seams[0]!.id })
    expect(reachTargets(state()).map((s) => s.id)).toEqual([seams[0]!.id])
  })
})

describe('runReach', () => {
  it('shows a notice and calls nothing when there is no port', async () => {
    loadSnakeSeams()
    state().deletePort('P1')
    let calls = 0
    await runReach(fakeClient({ reach: async () => (calls++, reachAnswer([])) }))
    expect(calls).toBe(0)
    expect(state().notice).toMatchObject({
      what: 'Reach was not run because there is no port.',
      why: 'The snake arm enters the part through a port, and none has been placed.',
      next: 'Choose Add port and click the part where the opening is, then run reach again.',
    })
    expect(state().reachBusy).toBe(false)
  })

  it('shows a notice and calls nothing when no seam qualifies', async () => {
    const seams = loadSnakeSeams()
    state().mergeAccess(Object.fromEntries(seams.map((s) => [s.id, { access: { ...SNAKE, class: 'standard' as const }, stations: [], points: s.points }])))
    let calls = 0
    await runReach(fakeClient({ reach: async () => (calls++, reachAnswer([])) }))
    expect(calls).toBe(0)
    expectReadable(state().notice!)
    expect(state().notice!.what).toMatch(/no snake seams/)
  })

  it('sends only the accepted snake seams when nothing is selected, and stores what comes back for the current ports and arm', async () => {
    const seams = loadSnakeSeams()
    const sent: string[] = []
    await runReach(fakeClient({ reach: async (batch) => (sent.push(...batch.map((s) => s.id)), reachAnswer(batch, 0.7)) }))
    expect(sent).toEqual(seams.map((s) => s.id))
    for (const seam of seams) expect(reachFor(state(), seam)?.coverage).toBe(0.7)
    expect(state().reachKeyById[seams[0]!.id]).toBe(reachKey(state().ports, state().arm))
    expect(state().reachBusy).toBe(false)
    expect(state().reachProgress).toBeNull()
    expect(state().info).toContain(`${seams.length}`)
  })

  it('sends only the selected seams when there is a selection', async () => {
    const seams = loadSnakeSeams()
    useStore.setState({ selectedIds: [seams[0]!.id], selectedId: seams[0]!.id })
    const sent: string[] = []
    await runReach(fakeClient({ reach: async (batch) => (sent.push(...batch.map((s) => s.id)), reachAnswer(batch)) }))
    expect(sent).toEqual([seams[0]!.id])
  })

  it('reports progress as seams done of seams in total while it runs', async () => {
    const seams = loadSnakeSeams()
    const gates = seams.map(() => deferred<ReachOutcome>())
    let call = 0
    const client = fakeClient({ reach: async () => gates[call++]!.promise })
    const run = runReach(client)
    await Promise.resolve()
    expect(state().reachBusy).toBe(true)
    expect(state().reachProgress).toEqual({ done: 0, total: seams.length })
    gates[0]!.resolve(reachAnswer([seams[0]!]))
    await new Promise((r) => setTimeout(r, 0))
    expect(state().reachProgress).toEqual({ done: 1, total: seams.length })
    for (let i = 1; i < gates.length; i++) {
      gates[i]!.resolve(reachAnswer([seams[i]!]))
      await new Promise((r) => setTimeout(r, 0))
    }
    await run
    expect(state().reachProgress).toBeNull()
  })

  it('is idle again after an error outcome, with the worker error as the notice', async () => {
    loadSnakeSeams()
    await runReach(fakeClient({ reach: async () => ({ status: 'error', error: { what: 'w', why: 'y', next: 'n' } }) }))
    expect(state().reachBusy).toBe(false)
    expect(state().reachProgress).toBeNull()
    expect(state().notice?.what).toBe('w')
  })

  it('drops the answer of a run that a newer run has overtaken', async () => {
    const seams = loadSnakeSeams()
    useStore.setState({ selectedIds: [seams[0]!.id], selectedId: seams[0]!.id })
    const slow = deferred<ReachOutcome>()
    const first = runReach(fakeClient({ reach: async () => slow.promise }))
    await Promise.resolve()
    const second = runReach(fakeClient({ reach: async (batch) => reachAnswer(batch, 0.9) }))
    await second
    slow.resolve(reachAnswer([seams[0]!], 0.1))
    await first
    expect(reachFor(state(), seams[0]!)?.coverage).toBe(0.9)
  })

  it('stops the seam in flight on cancel, keeps what was measured and goes idle', async () => {
    const seams = loadSnakeSeams()
    const gates = seams.map(() => deferred<ReachOutcome>())
    let call = 0
    let stops = 0
    const client = fakeClient({ reach: async () => gates[call++]!.promise, cancelReach: async () => void stops++ })
    const run = runReach(client)
    await Promise.resolve()
    gates[0]!.resolve(reachAnswer([seams[0]!], 0.8))
    await new Promise((r) => setTimeout(r, 0))
    cancelReach(client)
    expect(stops, 'the worker is told to stop the seam in flight').toBe(1)
    expect(state().reachBusy).toBe(false)
    expect(state().reachProgress).toBeNull()
    gates[1]?.resolve({ status: 'cancelled' })
    await run
    expect(call).toBe(2)
    expect(reachFor(state(), seams[0]!)?.coverage).toBe(0.8)
    expect(reachFor(state(), seams[1]!)).toBeNull()
    expect(state().info).toMatch(/cancelled/i)
  })

  it('stops and says why when the ports or the arm change during the run', async () => {
    const seams = loadSnakeSeams()
    let call = 0
    const run = runReach(fakeClient({ reach: async (batch) => (call++ === 0 && state().setArm({ maxBendDeg: 25 }), reachAnswer(batch)) }))
    await run
    expect(call).toBe(1)
    expect(state().info).toMatch(/changed/)
    expect(state().reachBusy).toBe(false)
    expect(seams.length).toBeGreaterThan(1)
  })
})

describe('staleReachSeams', () => {
  it('is empty before any run and right after a run', async () => {
    loadSnakeSeams()
    expect(staleReachSeams(state())).toEqual([])
    await runReach(fakeClient({ reach: async (batch) => reachAnswer(batch) }))
    expect(staleReachSeams(state())).toEqual([])
  })

  it('is the accepted seams whose result was measured with the old ports or arm', async () => {
    const seams = loadSnakeSeams()
    await runReach(fakeClient({ reach: async (batch) => reachAnswer(batch) }))
    state().setArm({ maxBendDeg: 25 })
    expect(staleReachSeams(state()).map((s) => s.id)).toEqual(seams.map((s) => s.id))
    useStore.setState({ selectedIds: [seams[0]!.id], selectedId: seams[0]!.id })
    await runReach(fakeClient({ reach: async (batch) => reachAnswer(batch) }))
    expect(staleReachSeams(state()).map((s) => s.id)).toEqual(seams.slice(1).map((s) => s.id))
  })

  it('leaves out a seam that is no longer accepted', async () => {
    const seams = loadSnakeSeams()
    await runReach(fakeClient({ reach: async (batch) => reachAnswer(batch) }))
    state().setArm({ maxBendDeg: 25 })
    useStore.setState({ statusById: { ...state().statusById, [seams[0]!.id]: 'rejected' } })
    expect(staleReachSeams(state()).map((s) => s.id)).toEqual(seams.slice(1).map((s) => s.id))
  })
})

describe('runStaleReach', () => {
  it('measures exactly the out-of-date seams, whatever is selected, and none is out of date after', async () => {
    const seams = loadSnakeSeams()
    await runReach(fakeClient({ reach: async (batch) => reachAnswer(batch) }))
    state().setArm({ maxBendDeg: 25 })
    useStore.setState({ selectedIds: [seams[0]!.id], selectedId: seams[0]!.id })
    await runReach(fakeClient({ reach: async (batch) => reachAnswer(batch) }))
    const sent: string[] = []
    await runStaleReach(fakeClient({ reach: async (batch) => (sent.push(...batch.map((s) => s.id)), reachAnswer(batch)) }))
    expect(sent).toEqual(seams.slice(1).map((s) => s.id))
    expect(staleReachSeams(state())).toEqual([])
  })

  it('calls nothing when no seam is out of date', async () => {
    loadSnakeSeams()
    let calls = 0
    await runStaleReach(fakeClient({ reach: async () => (calls++, reachAnswer([])) }))
    expect(calls).toBe(0)
  })
})

describe('insertSelected', () => {
  const chain = { joints: [[0, 0, 0], [0, 0, -100], [0, 0, -250]] as Array<[number, number, number]> }
  const frames = [{ tipS: 0, joints: chain.joints }, { tipS: 10, joints: chain.joints }]

  it('asks the worker for the station nearest the scrub position from the reach port and stores the frames', async () => {
    const seams = loadSnakeSeams()
    const id = seams[0]!.id
    const reach: SeamReach = { ...reachOf(0.9), stations: [{ s: 0, ok: true, chain }, { s: 100, ok: true, chain }] }
    state().mergeReach({ [id]: { ...reach, points: seams[0]!.points, key: reachKey(state().ports, state().arm) } })
    useStore.setState({ selectedId: id, selectedIds: [id], scrubS: 90 })
    const calls: Array<{ s: number; port: string }> = []
    await insertSelected(fakeClient({ insertion: async (_seam, s, port) => (calls.push({ s, port: port.id }), { status: 'ok', frames }) }))
    expect(calls).toEqual([{ s: 100, port: 'P1' }])
    expect(state().insertionState).toMatchObject({ seamId: id, frame: 0, playing: false })
    expect(state().insertionState?.frames).toHaveLength(2)
  })

  it('explains itself and calls nothing when the seam has no current reach', async () => {
    const seams = loadSnakeSeams()
    useStore.setState({ selectedId: seams[0]!.id, selectedIds: [seams[0]!.id] })
    let calls = 0
    await insertSelected(fakeClient({ insertion: async () => (calls++, { status: 'ok', frames }) }))
    expect(calls).toBe(0)
    expectReadable(state().notice!)
  })

  it('shows the worker error as the notice when the station cannot be reached', async () => {
    const seams = loadSnakeSeams()
    const id = seams[0]!.id
    state().mergeReach({ [id]: { ...reachOf(0.9), points: seams[0]!.points, key: reachKey(state().ports, state().arm) } })
    useStore.setState({ selectedId: id, selectedIds: [id] })
    await insertSelected(fakeClient({ insertion: async () => ({ status: 'error', error: { what: 'w', why: 'y', next: 'n' } }) }))
    expect(state().notice?.what).toBe('w')
    expect(state().insertionState).toBeNull()
  })
})
