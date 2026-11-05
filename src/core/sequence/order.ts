import type { Explained, PlanSequence } from '../job/plan'

// One place of the sequence as the planner holds it: the seam, which way it is welded, and whether the user pinned it.
export interface OrderEntry {
  seamId: string
  reversed: boolean
  locked: boolean
}

type Entry = PlanSequence['order'][number]

// Keeps the order of the seams that are still accepted, with their directions. A seam the order does not know yet goes
// at the end, forward, in table order; an id that is gone, or listed twice, is dropped. extra fills the other fields
// an added entry needs, for an order that carries more than a seam and a direction.
export function reconcileOrder<T extends Entry = Entry>(order: T[], tableIds: string[], extra?: Omit<T, keyof Entry>): T[] {
  const accepted = new Set(tableIds)
  const seen = new Set<string>()
  const kept = order.filter((entry) => {
    if (!accepted.has(entry.seamId) || seen.has(entry.seamId)) return false
    seen.add(entry.seamId)
    return true
  })
  const added = tableIds.filter((id) => !seen.has(id)).map((seamId) => ({ ...extra, seamId, reversed: false }) as T)
  return [...kept.map((entry) => ({ ...entry })), ...added]
}

// After an edit replaces seams by new ones (trim, split, merge, reverse), the new seams take the place of the parent
// that comes first in the order, with its direction and lock. A seam welded backwards is welded from its last part to
// its first, so its parts go in the order in reverse. The other parents leave the order.
export function replaceInOrder(order: OrderEntry[], parentIds: string[], childIds: string[]): OrderEntry[] {
  const parents = new Set(parentIds)
  const at = order.findIndex((entry) => parents.has(entry.seamId))
  if (at < 0) return order
  const { reversed, locked } = order[at]!
  const children = (reversed ? [...childIds].reverse() : childIds).map((seamId) => ({ seamId, reversed, locked }))
  return order.flatMap((entry, i) => (i === at ? children : parents.has(entry.seamId) ? [] : [entry]))
}

const refusal = (what: string, why: string, next: string): Explained => ({ what, why, next })

// Moves the row at index from to the place of the row at index to. Locked rows keep their index: the rows that are not
// locked move among the slots that are not locked. A locked row cannot be moved and a locked slot cannot be taken.
export function reorder(order: OrderEntry[], from: number, to: number): OrderEntry[] | Explained {
  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < order.length
  if (!inRange(from) || !inRange(to)) {
    return refusal(
      'The seam was not moved.',
      'The place it was dropped on is not in the sequence list.',
      'Drag the seam onto another row of the list, or move it with Alt and the arrow keys.',
    )
  }
  if (order[from]!.locked) {
    return refusal(
      'The seam was not moved because it is locked.',
      'A locked seam stays at its place in the sequence, so the optimiser and the other seams leave it alone.',
      'Unlock the seam with its lock button, then move it.',
    )
  }
  if (order[to]!.locked) {
    return refusal(
      'The seam was not moved because that place is locked.',
      'The seam at that place is locked and keeps its position in the sequence.',
      'Drop it on a row that is not locked, or unlock that row first.',
    )
  }
  const free = order.map((entry, i) => (entry.locked ? -1 : i)).filter((i) => i >= 0)
  const moving = free.map((i) => order[i]!)
  const [taken] = moving.splice(free.indexOf(from), 1)
  moving.splice(free.indexOf(to), 0, taken!)
  const result = order.map((entry) => ({ ...entry }))
  free.forEach((slot, k) => {
    result[slot] = moving[k]!
  })
  return result
}

export function toggleLock(order: OrderEntry[], seamId: string): OrderEntry[] {
  return order.map((entry) => (entry.seamId === seamId ? { ...entry, locked: !entry.locked } : { ...entry }))
}

// Table order again: locked seams keep their slot and direction, the others fill the free slots in table order, forward.
export function resetToTable(order: OrderEntry[], tableIds: string[]): OrderEntry[] {
  const reconciled = reconcileOrder(order, tableIds, { locked: false })
  const lockedIds = new Set(reconciled.filter((entry) => entry.locked).map((entry) => entry.seamId))
  const rest = tableIds.filter((id) => !lockedIds.has(id))
  let next = 0
  return reconciled.map((entry) => (entry.locked ? { ...entry } : { seamId: rest[next++]!, reversed: false, locked: false }))
}
