import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planTiming } from '../../../src/core/job/timing'
import { playbackPathOf, playbackTotalS } from '../../../src/core/sequence/playback'
import { PLAYBACK_DEBOUNCE_MS, startPlaybackSync } from '../../../src/state/playbackSync'
import { selectPlan } from '../../../src/state/selectors'
import { useStore } from '../../../src/state/store'
import { createGeometryApi } from '../../../src/worker/geometry.api'
import { deferred, fakeClient, partInfo, resetStore } from '../helpers/state'
import { samplePlan, SPRAY_ID } from '../helpers/jobs'

const state = () => useStore.getState()

function loadSeams(count = 3) {
  const plan = samplePlan('double-bottom-cell')
  const seams = plan.seams.slice(0, count).map((p) => p.seam)
  useStore.setState({
    part: partInfo({ ...plan.part, sourceUnits: 'mm' }),
    seams,
    statusById: Object.fromEntries(seams.map((s) => [s.id, 'accepted' as const])),
    procedureById: Object.fromEntries(seams.map((s) => [s.id, SPRAY_ID])),
  })
}

// Gives the slice a path and timing for the current plan, as the sync would.
function withPlayback() {
  loadSeams()
  const plan = selectPlan(state())
  state().setPlayback(plan, { path: playbackPathOf(plan), timing: planTiming(plan) })
  return playbackTotalS(planTiming(plan))
}

beforeEach(resetStore)

describe('playback slice', () => {
  it('starts paused at 0 s and 1x, with no path', () => {
    expect([state().playing, state().timeS, state().speed, state().playback]).toEqual([false, 0, 1, null])
  })

  it('plays only when there is something to play', () => {
    state().play()
    expect(state().playing).toBe(false)
    withPlayback()
    state().play()
    expect(state().playing).toBe(true)
    state().pause()
    expect(state().playing).toBe(false)
  })

  it('advances by dt times the speed while playing and not while paused', () => {
    withPlayback()
    state().tick(1)
    expect(state().timeS).toBe(0)
    state().play()
    state().tick(0.5)
    expect(state().timeS).toBeCloseTo(0.5, 9)
    state().setSpeed(20)
    state().tick(0.5)
    expect(state().timeS).toBeCloseTo(10.5, 9)
  })

  it('stops at the end instead of running past it', () => {
    const total = withPlayback()
    state().play()
    state().tick(total * 2)
    expect(state().timeS).toBe(total)
    expect(state().playing).toBe(false)
  })

  it('restarts from 0 when toggled at the end, and toggles between play and pause otherwise', () => {
    const total = withPlayback()
    state().seek(total)
    state().toggle()
    expect([state().playing, state().timeS]).toEqual([true, 0])
    state().toggle()
    expect(state().playing).toBe(false)
    state().seek(5)
    state().toggle()
    expect([state().playing, state().timeS]).toEqual([true, 5])
  })

  it('seeks within 0 and the total and ignores a value that is not a number', () => {
    const total = withPlayback()
    state().seek(-3)
    expect(state().timeS).toBe(0)
    state().seek(total + 50)
    expect(state().timeS).toBe(total)
    state().seek(12)
    state().seek(Number.NaN)
    expect(state().timeS).toBe(12)
  })

  it('does not move the time when the speed changes in the middle of playing', () => {
    withPlayback()
    state().play()
    state().tick(2)
    const before = state().timeS
    state().setSpeed(5)
    expect(state().timeS).toBe(before)
    expect(state().speed).toBe(5)
    expect(state().playing).toBe(true)
  })

  it('is not undo history', () => {
    withPlayback()
    const past = useStore.temporal.getState().pastStates.length
    state().play()
    state().tick(1)
    state().seek(3)
    state().setSpeed(5)
    expect(useStore.temporal.getState().pastStates.length).toBe(past)
  })

  it('stops and goes back to 0 when another part is loaded', async () => {
    withPlayback()
    state().play()
    state().tick(2)
    const { importBuffer } = await import('../../../src/state/flows')
    const { readyOutcome, detected } = await import('../helpers/state')
    await importBuffer(new ArrayBuffer(8), 'a.stl', fakeClient({ loadStl: async () => readyOutcome(), detect: async () => detected([]) }))
    expect([state().playing, state().timeS, state().playback]).toEqual([false, 0, null])
  })
})

describe('startPlaybackSync', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const client = () => fakeClient({ playbackPath: (plan) => createGeometryApi().playbackPath(plan) })

  it('fetches the path for the plan once it has been still, in the Sequence step', async () => {
    const stop = startPlaybackSync(client())
    loadSeams()
    state().setActiveStep('sequence')
    await vi.advanceTimersByTimeAsync(PLAYBACK_DEBOUNCE_MS - 1)
    expect(state().playback).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(state().playbackFor).toBe(selectPlan(state()))
    expect(state().playback!.path.seams).toHaveLength(3)
    expect(state().playback!.timing.seams).toHaveLength(3)
    stop()
  })

  it('does not call the worker in steps that show no timeline', async () => {
    const playbackPath = vi.fn((plan: Parameters<ReturnType<typeof client>['playbackPath']>[0]) => createGeometryApi().playbackPath(plan))
    const stop = startPlaybackSync(fakeClient({ playbackPath }))
    loadSeams()
    state().setActiveStep('seams')
    await vi.advanceTimersByTimeAsync(PLAYBACK_DEBOUNCE_MS * 3)
    expect(playbackPath).not.toHaveBeenCalled()
    state().setActiveStep('export')
    await vi.advanceTimersByTimeAsync(PLAYBACK_DEBOUNCE_MS)
    expect(playbackPath).toHaveBeenCalledTimes(1)
    stop()
  })

  it('drops the answer for a plan that has changed since', async () => {
    const first = deferred<Awaited<ReturnType<ReturnType<typeof client>['playbackPath']>>>()
    const second = deferred<Awaited<ReturnType<ReturnType<typeof client>['playbackPath']>>>()
    const gates = [first, second]
    let n = 0
    const stop = startPlaybackSync(fakeClient({ playbackPath: () => gates[n++]!.promise }))
    loadSeams()
    state().setActiveStep('sequence')
    await vi.advanceTimersByTimeAsync(PLAYBACK_DEBOUNCE_MS)
    const older = selectPlan(state())
    state().toggleAccepted(older.seams[0]!.seam.id)
    await vi.advanceTimersByTimeAsync(PLAYBACK_DEBOUNCE_MS)
    const real = createGeometryApi()
    first.resolve(await real.playbackPath(older))
    await vi.advanceTimersByTimeAsync(0)
    expect(state().playback).toBeNull()
    second.resolve(await real.playbackPath(selectPlan(state())))
    await vi.advanceTimersByTimeAsync(0)
    expect(state().playbackFor).toBe(selectPlan(state()))
    stop()
  })

  it('shows a worker error as a notice', async () => {
    const error = { what: 'The playback path could not be worked out.', why: 'The worker stopped.', next: 'Reload the page.' }
    const stop = startPlaybackSync(fakeClient({ playbackPath: async () => ({ status: 'error', error }) }))
    loadSeams()
    state().setActiveStep('sequence')
    await vi.advanceTimersByTimeAsync(PLAYBACK_DEBOUNCE_MS)
    expect(state().notice).toEqual(error)
    stop()
  })
})
