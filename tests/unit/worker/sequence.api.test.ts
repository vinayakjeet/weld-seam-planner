import { describe, expect, it } from 'vitest'
import { planTiming } from '../../../src/core/job/timing'
import type { Plan } from '../../../src/core/job/plan'
import { createGeometryApi, type SequenceOutcome } from '../../../src/worker/geometry.api'
import { samplePlan } from '../helpers/jobs'

const plan = samplePlan('double-bottom-cell')
const tableIds = plan.seams.map((p) => p.seam.id)
const table = tableIds.map((seamId) => ({ seamId, reversed: false }))

function ok(outcome: SequenceOutcome) {
  if (outcome.status !== 'ok') throw new Error(`expected ok, got ${outcome.error.what}`)
  return outcome
}

const airMm = (p: Plan, order: { seamId: string; reversed: boolean }[]) =>
  planTiming({ ...p, sequence: { strategy: 'manual', order } }).moves.reduce((total, m) => total + m.lengthMm, 0)

describe('optimiseSequence on double-bottom-cell', () => {
  const api = createGeometryApi()

  it('returns every seam once and seams + 1 moves, home at both ends', async () => {
    const { order, moves } = ok(await api.optimiseSequence(plan, 'min-air-move', [], table))
    expect([...order.map((o) => o.seamId)].sort()).toEqual([...tableIds].sort())
    expect(moves).toHaveLength(tableIds.length + 1)
    expect([moves[0]!.from, moves[moves.length - 1]!.to]).toEqual(['home', 'home'])
  })

  it('flies less than the table order', async () => {
    const { order } = ok(await api.optimiseSequence(plan, 'min-air-move', [], table))
    expect(airMm(plan, order)).toBeLessThan(airMm(plan, table) * 0.6)
  })

  it('keeps a locked seam in the slot and direction it has', async () => {
    const start = table.map((entry, i) => (i === 4 ? { ...entry, reversed: true } : entry))
    const locked = [start[0]!.seamId, start[4]!.seamId]
    const { order } = ok(await api.optimiseSequence(plan, 'min-air-move', locked, start))
    expect(order[0]).toEqual(start[0])
    expect(order[4]).toEqual(start[4])
  })

  it('gives a different order for balanced heat than for minimum air travel', async () => {
    const minAir = ok(await api.optimiseSequence(plan, 'min-air-move', [], table)).order
    const balanced = ok(await api.optimiseSequence(plan, 'balanced-heat', [], table)).order
    expect(balanced.map((o) => o.seamId)).not.toEqual(minAir.map((o) => o.seamId))
    expect([...balanced.map((o) => o.seamId)].sort()).toEqual([...tableIds].sort())
  })

  it('puts the free seams back in table order for the table strategy, keeping locks', async () => {
    const shuffled = [...table].reverse()
    const lockedId = shuffled[2]!.seamId
    const { order } = ok(await api.optimiseSequence(plan, 'table-order', [lockedId], shuffled))
    expect(order[2]!.seamId).toBe(lockedId)
    const free = order.filter((_, i) => i !== 2).map((o) => o.seamId)
    expect(free).toEqual(tableIds.filter((id) => id !== lockedId))
  })

  it('reports moves that match the planned timing of the order it returns', async () => {
    const { order, moves } = ok(await api.optimiseSequence(plan, 'min-air-move', [], table))
    expect(moves.reduce((total, m) => total + m.lengthMm, 0)).toBeCloseTo(airMm(plan, order), 6)
  })

  it('drops ids that are not seams of the plan and adds seams the current order misses', async () => {
    const { order } = ok(await api.optimiseSequence(plan, 'min-air-move', [], [{ seamId: 'nope', reversed: true }, ...table.slice(10)]))
    expect([...order.map((o) => o.seamId)].sort()).toEqual([...tableIds].sort())
  })

  it('gives an empty answer for a plan without seams', async () => {
    const { order, moves } = ok(await api.optimiseSequence({ ...plan, seams: [] }, 'min-air-move', [], []))
    expect([order, moves]).toEqual([[], []])
  })
})
