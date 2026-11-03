import type { PlanSequence } from '../job/plan'

// Keeps the order of the seams that are still accepted, with their directions. A seam the order does not know yet goes
// at the end, forward, in table order; an id that is gone, or listed twice, is dropped.
export function reconcileOrder(order: PlanSequence['order'], tableIds: string[]): PlanSequence['order'] {
  const accepted = new Set(tableIds)
  const seen = new Set<string>()
  const kept = order.filter((entry) => {
    if (!accepted.has(entry.seamId) || seen.has(entry.seamId)) return false
    seen.add(entry.seamId)
    return true
  })
  const added = tableIds.filter((id) => !seen.has(id)).map((seamId) => ({ seamId, reversed: false }))
  return [...kept.map((entry) => ({ ...entry })), ...added]
}
