import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planTiming } from '../../../src/core/job/timing'
import { selectPlan } from '../../../src/state/selectors'
import { startTimingSync, TIMING_DEBOUNCE_MS } from '../../../src/state/timingSync'
import { useStore } from '../../../src/state/store'
import { cycleField, formatCycle } from '../../../src/ui/shell/summary'
import { deferred, fakeClient, partInfo, resetStore } from '../helpers/state'
import { samplePlan, SPRAY_ID } from '../helpers/jobs'

const state = () => useStore.getState()

// The t-joint sample as store state: its seams accepted, the spray procedure not yet assigned.
function loadSeams() {
  const plan = samplePlan('t-joint-merged')
  useStore.setState({
    part: partInfo({ ...plan.part, sourceUnits: 'mm' }),
    seams: plan.seams.map((p) => p.seam),
    statusById: Object.fromEntries(plan.seams.map((p) => [p.seam.id, 'accepted' as const])),
  })
  return plan
}

const okClient = () => fakeClient({ planTiming: async (plan) => ({ status: 'ok', timing: planTiming(plan) }) })

beforeEach(() => {
  resetStore()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('startTimingSync', () => {
  it('waits 150 ms for the plan to be still, then stores the timing for that plan', async () => {
    const calls: unknown[] = []
    const stop = startTimingSync(fakeClient({ planTiming: async (plan) => (calls.push(plan), { status: 'ok', timing: planTiming(plan) }) }))
    await vi.advanceTimersByTimeAsync(TIMING_DEBOUNCE_MS)
    calls.length = 0

    loadSeams()
    state().assignProcedure(Object.keys(state().statusById), SPRAY_ID)
    await vi.advanceTimersByTimeAsync(TIMING_DEBOUNCE_MS - 1)
    expect(calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toHaveLength(1)
    expect(TIMING_DEBOUNCE_MS).toBe(150)
    expect(state().timingFor).toBe(selectPlan(state()))
    stop()
  })

  it('adds the arc time to the cycle time once procedures are assigned', async () => {
    const stop = startTimingSync(okClient())
    loadSeams()
    await vi.advanceTimersByTimeAsync(TIMING_DEBOUNCE_MS)
    const before = state().timing!
    expect(before.arcTimeS).toBe(0)

    state().assignProcedure(Object.keys(state().statusById), SPRAY_ID)
    await vi.advanceTimersByTimeAsync(TIMING_DEBOUNCE_MS)
    const after = state()
    const field = cycleField(after.timing, after.timingFor === selectPlan(after))
    expect(after.timing!.arcTimeS).toBeGreaterThan(0)
    expect(after.timing!.cycleTimeS).toBeGreaterThan(before.cycleTimeS)
    expect(field).toEqual({ value: formatCycle(after.timing!.cycleTimeS), stale: false })
    expect(field.value).not.toBe('0:00')
    expect(field.stale).toBe(false)
    stop()
  })

  it('does not call the worker for a change that is not part of the plan', async () => {
    const planTimingCall = vi.fn(async () => ({ status: 'ok' as const, timing: planTiming(samplePlan('t-joint-merged')) }))
    const stop = startTimingSync(fakeClient({ planTiming: planTimingCall }))
    await vi.advanceTimersByTimeAsync(TIMING_DEBOUNCE_MS)
    planTimingCall.mockClear()
    state().hover('x')
    state().select('x')
    await vi.advanceTimersByTimeAsync(TIMING_DEBOUNCE_MS * 2)
    expect(planTimingCall).not.toHaveBeenCalled()
    stop()
  })

  it('drops the answer for an older plan and keeps the previous timing until the newest lands', async () => {
    const first = deferred<{ status: 'ok'; timing: ReturnType<typeof planTiming> }>()
    const second = deferred<{ status: 'ok'; timing: ReturnType<typeof planTiming> }>()
    const gates = [first, second]
    let n = 0
    const stop = startTimingSync(fakeClient({ planTiming: () => gates[n++]!.promise }))
    loadSeams()
    await vi.advanceTimersByTimeAsync(TIMING_DEBOUNCE_MS)
    const older = selectPlan(state())
    state().assignProcedure(Object.keys(state().statusById), SPRAY_ID)
    await vi.advanceTimersByTimeAsync(TIMING_DEBOUNCE_MS)
    first.resolve({ status: 'ok', timing: planTiming(older) })
    await vi.advanceTimersByTimeAsync(0)
    expect(state().timingFor).toBeNull()
    second.resolve({ status: 'ok', timing: planTiming(selectPlan(state())) })
    await vi.advanceTimersByTimeAsync(0)
    expect(state().timingFor).toBe(selectPlan(state()))
    stop()
  })

  it('shows a worker error as a notice and leaves the timing alone', async () => {
    const error = { what: 'The cycle time could not be worked out.', why: 'The worker stopped.', next: 'Reload the page.' }
    const stop = startTimingSync(fakeClient({ planTiming: async () => ({ status: 'error', error }) }))
    await vi.advanceTimersByTimeAsync(TIMING_DEBOUNCE_MS)
    expect(state().notice).toEqual(error)
    expect(state().timing).toBeNull()
    stop()
  })

  it('does not put timing in the undo history', async () => {
    const stop = startTimingSync(okClient())
    loadSeams()
    state().assignProcedure(Object.keys(state().statusById), SPRAY_ID)
    await vi.advanceTimersByTimeAsync(TIMING_DEBOUNCE_MS)
    const past = useStore.temporal.getState().pastStates.length
    state().setTiming(selectPlan(state()), planTiming(selectPlan(state())))
    expect(useStore.temporal.getState().pastStates.length).toBe(past)
    stop()
  })

  it('stops listening once stopped', async () => {
    const planTimingCall = vi.fn(async () => ({ status: 'ok' as const, timing: planTiming(samplePlan('t-joint-merged')) }))
    const stop = startTimingSync(fakeClient({ planTiming: planTimingCall }))
    await vi.advanceTimersByTimeAsync(TIMING_DEBOUNCE_MS)
    planTimingCall.mockClear()
    stop()
    useStore.setState({ statusById: { a: 'accepted' } })
    await vi.advanceTimersByTimeAsync(TIMING_DEBOUNCE_MS * 2)
    expect(planTimingCall).not.toHaveBeenCalled()
  })
})
