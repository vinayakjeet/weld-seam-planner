import { length, sub, type Vec3 } from '../math/vec3'
import type { EdgeCost, SequenceNode, Visit } from './types'

const EPS = 1e-9
const DEFAULT_TIME_BOX_MS = 50
const MAX_RUN = 3

export const enterOf = (v: Visit): Vec3 => (v.reversed ? v.node.enter.reverse : v.node.enter.forward)
export const leaveOf = (v: Visit): Vec3 => (v.reversed ? v.node.leave.reverse : v.node.leave.forward)

// The air move lengths of the export: a lead before and after every seam, and the distance between the torch points.
export function airEdge(home: Vec3, leadMm: number): EdgeCost {
  return (from, to) => {
    if (from === null && to === null) return 0
    if (from === null) return length(sub(enterOf(to!), home)) + leadMm
    if (to === null) return leadMm + length(sub(home, leaveOf(from)))
    return leadMm + length(sub(enterOf(to), leaveOf(from))) + leadMm
  }
}

export function tourCost(tour: Visit[], edge: EdgeCost): number {
  if (tour.length === 0) return 0
  let total = edge(null, tour[0]!) + edge(tour[tour.length - 1]!, null)
  for (let i = 1; i < tour.length; i++) total += edge(tour[i - 1]!, tour[i]!)
  return total
}

export function airLengthMm(tour: Visit[], home: Vec3, leadMm: number): number {
  return tourCost(tour, airEdge(home, leadMm))
}

export interface OptimiseOptions {
  timeBoxMs?: number
  // A clock in ms; injected so a test can spend the time box at once.
  now?: () => number
  // The order to start from and to compare against; table order, all forward, when absent. Locked seams keep the
  // slot and direction they have here.
  start?: Visit[]
}

// A flipped visit; a closed loop has one way to be travelled.
const flip = (v: Visit): Visit => (v.node.closed ? v : { node: v.node, reversed: !v.reversed })
const forwardOnly = (v: Visit): Visit => (v.node.closed && v.reversed ? { node: v.node, reversed: false } : v)

// Nearest neighbour from home, then 2-opt (which also flips a single seam) and Or-opt on the seams that are not locked.
// Locked seams stay in their slot with their direction. The result is never costlier than the start order.
export function optimise(nodes: SequenceNode[], edge: EdgeCost, options: OptimiseOptions = {}): Visit[] {
  const n = nodes.length
  if (n === 0) return []
  const now = options.now ?? (() => performance.now())
  const deadline = now() + (options.timeBoxMs ?? DEFAULT_TIME_BOX_MS)

  const base: Visit[] = options.start ?? nodes.map((node) => ({ node, reversed: false }))
  // A locked visit fills its slot as given; a free slot is null until the search places a seam there.
  const slots: Array<Visit | null> = base.map((v) => (v.node.locked ? v : null))
  const free = base.filter((v) => !v.node.locked).map((v) => v.node)
  const freeSlots = slots.flatMap((s, i) => (s === null ? [i] : []))

  const assemble = (sequence: Visit[]): Visit[] => {
    const tour = slots.map((s) => s)
    freeSlots.forEach((slot, k) => (tour[slot] = sequence[k]!))
    return tour as Visit[]
  }

  // Nearest neighbour: fill the slots in order, choosing for each free slot the cheapest seam and entry end.
  const remaining = new Set(free)
  const constructed: Visit[] = []
  let previous: Visit | null = null
  slots.forEach((slot) => {
    if (slot !== null) {
      previous = slot
      return
    }
    let best: Visit | null = null
    let bestCost = Infinity
    for (const node of remaining) {
      for (const reversed of node.closed ? [false] : [false, true]) {
        const candidate: Visit = { node, reversed }
        const cost = edge(previous, candidate)
        if (cost < bestCost - EPS) {
          best = candidate
          bestCost = cost
        }
      }
    }
    remaining.delete(best!.node)
    constructed.push(best!)
    previous = best
  })

  let sequence = constructed
  let cost = tourCost(assemble(sequence), edge)
  const m = sequence.length
  const expired = () => now() > deadline

  const consider = (candidate: Visit[]): boolean => {
    const c = tourCost(assemble(candidate), edge)
    if (c < cost - EPS) {
      sequence = candidate
      cost = c
      return true
    }
    return false
  }

  let improved = true
  while (improved && m > 0 && !expired()) {
    improved = false
    // 2-opt: reverse the run i..j and flip each seam in it; i = j is a pure direction flip.
    for (let i = 0; i < m && !improved && !expired(); i++) {
      for (let j = i; j < m && !expired(); j++) {
        const run = sequence.slice(i, j + 1).reverse().map(flip)
        if (consider([...sequence.slice(0, i), ...run, ...sequence.slice(j + 1)])) {
          improved = true
          break
        }
      }
    }
    // Or-opt: move a run of one to three seams elsewhere, as it is or reversed.
    for (let len = 1; len <= Math.min(MAX_RUN, m - 1) && !improved && !expired(); len++) {
      for (let i = 0; i + len <= m && !improved && !expired(); i++) {
        const run = sequence.slice(i, i + len)
        const rest = [...sequence.slice(0, i), ...sequence.slice(i + len)]
        for (let k = 0; k <= rest.length && !expired(); k++) {
          if (k === i) continue
          const reversedRun = run.slice().reverse().map(flip)
          if (consider([...rest.slice(0, k), ...run, ...rest.slice(k)]) || consider([...rest.slice(0, k), ...reversedRun, ...rest.slice(k)])) {
            improved = true
            break
          }
        }
      }
    }
  }

  const result = assemble(sequence)
  const startOrder = base.map((v) => (v.node.locked ? v : forwardOnly(v)))
  return tourCost(result, edge) <= tourCost(startOrder, edge) + EPS ? result : startOrder
}
