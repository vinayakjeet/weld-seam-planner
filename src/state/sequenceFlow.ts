import type { Explained } from '../core/job/plan'
import type { SequenceStrategy } from '../core/sequence/types'
import type { GeometryClient } from '../worker/client'
import { attempt } from './flows'
import { selectPlan, selectSequenceOrder } from './selectors'
import { useStore } from './store'

// Applies a strategy to the sequence: table order is applied here, the other two ask the worker, which starts from the
// current order and leaves locked seams where they are. One undo step. Returns what went wrong, or null. An answer for
// a plan that changed while the worker was busy is dropped, because its order would no longer fit.
export async function runOptimise(client: GeometryClient, strategy: SequenceStrategy): Promise<Explained | null> {
  const state = useStore.getState()
  const plan = selectPlan(state)
  if (plan.seams.length === 0) {
    return {
      what: 'The sequence was not optimised.',
      why: 'There are no accepted seams to put in order.',
      next: 'Accept the seams you want to weld in the Seams step, then optimise again.',
    }
  }
  if (strategy === 'table-order') {
    state.useTableOrder()
    return null
  }
  const current = selectSequenceOrder(state)
  const outcome = await attempt(() =>
    client.optimiseSequence(
      plan,
      strategy,
      current.filter((e) => e.locked).map((e) => e.seamId),
      current.map(({ seamId, reversed }) => ({ seamId, reversed })),
    ),
  )
  if (outcome.status === 'error') return outcome.error
  if (plan !== selectPlan(useStore.getState())) return null
  useStore.getState().setSequence(strategy, outcome.order)
  return null
}
