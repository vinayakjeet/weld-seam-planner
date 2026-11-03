import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planTiming } from '../../../src/core/job/timing'
import { buildJob } from '../../../src/core/job/build'
import { selectPlan, selectSequenceOrder } from '../../../src/state/selectors'
import { runOptimise } from '../../../src/state/sequenceFlow'
import { useStore } from '../../../src/state/store'
import { createGeometryApi } from '../../../src/worker/geometry.api'
import { CREATED_AT, samplePlan, SPRAY_ID } from '../helpers/jobs'
import { fakeClient, partInfo, resetStore } from '../helpers/state'

const state = () => useStore.getState()
const planIds = () => selectPlan(state()).seams.map((p) => p.seam.id)
const shown = () => selectSequenceOrder(state()).map((e) => e.seamId)

// A few seams of double-bottom-cell as store state, all accepted, with the spray procedure.
function load(count = 6, sample = 'double-bottom-cell') {
  const plan = samplePlan(sample)
  const seams = plan.seams.slice(0, count).map((p) => p.seam)
  useStore.setState({
    part: partInfo({ ...plan.part, sourceUnits: 'mm' }),
    seams,
    statusById: Object.fromEntries(seams.map((s) => [s.id, 'accepted' as const])),
    procedureById: Object.fromEntries(seams.map((s) => [s.id, SPRAY_ID])),
  })
  useStore.temporal.getState().clear()
  return seams.map((s) => s.id)
}

const realClient = () => fakeClient({ optimiseSequence: (plan, strategy, locked, current) => createGeometryApi().optimiseSequence(plan, strategy, locked, current) })

beforeEach(resetStore)

describe('sequence slice', () => {
  it('starts in table order with no stored order, so the plan has no sequence', () => {
    const ids = load()
    expect(state().strategy).toBe('table-order')
    expect(state().order).toEqual([])
    expect(selectPlan(state()).sequence).toBeNull()
    expect(shown()).toEqual(ids)
  })

  it('reorders one row, sets the strategy to manual and puts the order into the plan', () => {
    const ids = load()
    expect(state().reorder(0, 3)).toBeNull()
    expect(state().strategy).toBe('manual')
    expect(shown()).toEqual([ids[1], ids[2], ids[3], ids[0], ids[4], ids[5]])
    expect(selectPlan(state()).sequence).toMatchObject({ strategy: 'manual' })
    expect(selectPlan(state()).sequence!.order.map((o) => o.seamId)).toEqual(shown())
  })

  it('refuses to move a locked row or onto a locked slot and changes nothing', () => {
    const ids = load()
    state().toggleLock(ids[1]!)
    const before = state().order
    const refusal = state().reorder(1, 3)
    expect(refusal).not.toBeNull()
    expect(refusal!.what.length).toBeGreaterThan(0)
    expect(state().reorder(0, 1)).not.toBeNull()
    expect(state().order).toBe(before)
    expect(state().strategy).not.toBe('manual')
  })

  it('keeps a lock at its index when other rows move', () => {
    const ids = load()
    state().toggleLock(ids[1]!)
    state().reorder(0, 3)
    expect(shown()[1]).toBe(ids[1])
    expect(selectSequenceOrder(state())[1]!.locked).toBe(true)
  })

  it('goes back to table order with the table order action, keeping locks', () => {
    const ids = load()
    state().reorder(0, 5)
    state().toggleLock(shown()[2]!)
    const lockedId = shown()[2]!
    state().useTableOrder()
    expect(state().strategy).toBe('table-order')
    expect(shown()[2]).toBe(lockedId)
    expect(shown().filter((id) => id !== lockedId)).toEqual(ids.filter((id) => id !== lockedId))
  })

  it('makes each action one undo step, and undo restores the previous order and strategy', () => {
    const ids = load()
    state().reorder(0, 2)
    state().toggleLock(ids[4]!)
    expect(useStore.temporal.getState().pastStates).toHaveLength(2)
    useStore.temporal.getState().undo()
    expect(selectSequenceOrder(state()).some((e) => e.locked)).toBe(false)
    expect(state().strategy).toBe('manual')
    useStore.temporal.getState().undo()
    expect(state().strategy).toBe('table-order')
    expect(shown()).toEqual(ids)
  })

  it('does not put hover or selection in the history, and the colour toggle is not history either', () => {
    load()
    state().reorder(0, 2)
    const past = useStore.temporal.getState().pastStates.length
    state().hover('x')
    state().select('x')
    state().setColourBy('access')
    expect(useStore.temporal.getState().pastStates.length).toBe(past)
  })
})

describe('sequence and accepted seams', () => {
  it('drops a seam that is rejected after being ordered from the shown order, the plan and the export', () => {
    const ids = load(5)
    state().reorder(0, 4)
    const ordered = shown()
    state().toggleAccepted(ids[2]!)
    expect(shown()).toEqual(ordered.filter((id) => id !== ids[2]))
    expect(planIds()).not.toContain(ids[2])
    expect(selectPlan(state()).sequence!.order.map((o) => o.seamId)).toEqual(shown())
    expect(buildJob(selectPlan(state()), { createdAt: CREATED_AT }).sequence.order.map((o) => o.seamId)).toEqual(shown())
  })

  it('appends a newly accepted seam at the end, forward, after the order the user made', () => {
    const ids = load(5)
    const extra = samplePlan('double-bottom-cell').seams[5]!
    useStore.setState({ seams: [...state().seams, extra.seam], procedureById: { ...state().procedureById, [extra.seam.id]: SPRAY_ID } })
    state().reorder(0, 4)
    const ordered = shown()
    state().toggleAccepted(extra.seam.id)
    expect(shown()).toEqual([...ordered, extra.seam.id])
    expect(selectSequenceOrder(state()).at(-1)).toEqual({ seamId: extra.seam.id, reversed: false, locked: false })
    expect(selectPlan(state()).sequence!.order.at(-1)).toEqual({ seamId: extra.seam.id, reversed: false })
    expect(ids).toHaveLength(5)
  })

  it('forgets a rejected seam for good once the order is written again, so a later accept appends it', () => {
    const ids = load(5)
    state().reorder(0, 4)
    state().toggleAccepted(ids[2]!)
    state().toggleLock(shown()[0]!)
    state().toggleAccepted(ids[2]!)
    expect(shown().at(-1)).toBe(ids[2])
  })

  it('exports in the order that is shown', () => {
    load()
    state().reorder(0, 3)
    state().reorder(4, 1)
    const job = buildJob(selectPlan(state()), { createdAt: CREATED_AT })
    expect(job.sequence.order.map((o) => o.seamId)).toEqual(shown())
    expect(job.seams.map((s) => s.id)).toEqual(shown())
    expect(job.sequence.strategy).toBe('manual')
  })

  it('moves the cycle time with the order', () => {
    load()
    const before = planTiming(selectPlan(state())).airTimeS
    state().reorder(0, 5)
    expect(planTiming(selectPlan(state())).airTimeS).not.toBeCloseTo(before, 6)
  })

  it('is cleared when another part loads', async () => {
    load()
    state().reorder(0, 3)
    const { importBuffer } = await import('../../../src/state/flows')
    const { readyOutcome, detected } = await import('../helpers/state')
    await importBuffer(new ArrayBuffer(8), 'a.stl', fakeClient({ loadStl: async () => readyOutcome(), detect: async () => detected([]) }))
    expect(state().order).toEqual([])
    expect(state().strategy).toBe('table-order')
  })
})

describe('runOptimise', () => {
  it('orders the accepted seams with the worker, shortens the air travel, and undo brings the old order back', async () => {
    load(20)
    const before = planTiming(selectPlan(state())).airTimeS
    expect(await runOptimise(realClient(), 'min-air-move')).toBeNull()
    expect(state().strategy).toBe('min-air-move')
    expect([...shown()].sort()).toEqual([...planIds()].sort())
    expect(planTiming(selectPlan(state())).airTimeS).toBeLessThan(before)
    useStore.temporal.getState().undo()
    expect(state().strategy).toBe('table-order')
    expect(planTiming(selectPlan(state())).airTimeS).toBeCloseTo(before, 6)
  })

  it('leaves a locked row where it is', async () => {
    const ids = load(12)
    state().toggleLock(ids[3]!)
    await runOptimise(realClient(), 'min-air-move')
    expect(shown()[3]).toBe(ids[3])
    expect(selectSequenceOrder(state())[3]!.locked).toBe(true)
  })

  it('applies table order without asking the worker', async () => {
    load()
    state().reorder(0, 4)
    const optimiseSequence = vi.fn()
    expect(await runOptimise(fakeClient({ optimiseSequence }), 'table-order')).toBeNull()
    expect(optimiseSequence).not.toHaveBeenCalled()
    expect(state().strategy).toBe('table-order')
  })

  it('says why when there are no accepted seams and does not ask the worker', async () => {
    const optimiseSequence = vi.fn()
    const problem = await runOptimise(fakeClient({ optimiseSequence }), 'min-air-move')
    expect(problem).not.toBeNull()
    expect(problem!.next.length).toBeGreaterThan(0)
    expect(optimiseSequence).not.toHaveBeenCalled()
  })

  it('returns the worker error and leaves the order alone', async () => {
    load()
    const error = { what: 'The order could not be optimised.', why: 'The worker stopped.', next: 'Reload the page.' }
    const problem = await runOptimise(fakeClient({ optimiseSequence: async () => ({ status: 'error', error }) }), 'min-air-move')
    expect(problem).toEqual(error)
    expect(state().order).toEqual([])
  })

  it('drops an answer for a plan that changed while the worker was busy', async () => {
    const ids = load(8)
    const client = fakeClient({
      optimiseSequence: async (plan, strategy, locked, current) => {
        const answer = await createGeometryApi().optimiseSequence(plan, strategy, locked, current)
        state().toggleAccepted(ids[0]!)
        return answer
      },
    })
    expect(await runOptimise(client, 'min-air-move')).toBeNull()
    expect(state().strategy).toBe('table-order')
  })
})
