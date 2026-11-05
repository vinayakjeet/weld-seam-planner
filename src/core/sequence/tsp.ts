import type { Vec3 } from '../math/vec3'
import { airMoveMm } from './air'
import type { EdgeCost, SequenceNode, Visit } from './types'

const EPS = 1e-9
const DEFAULT_TIME_BOX_MS = 50
const MAX_RUN = 3

export const enterOf = (v: Visit): Vec3 => (v.reversed ? v.node.enter.reverse : v.node.enter.forward)
export const leaveOf = (v: Visit): Vec3 => (v.reversed ? v.node.leave.reverse : v.node.leave.forward)

// The cost of an air move is the export's own measure, see airMoveMm.
export function airEdge(home: Vec3, leadMm: number): EdgeCost {
  return (from, to) => airMoveMm(from === null ? null : leaveOf(from), to === null ? null : enterOf(to), home, leadMm)
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
  // Called with the share of the work done, 0 to 1, never going back and at most a few hundred times. The nearest
  // neighbour construction takes the first 0.8, which is the part that grows with the square of the seam count; the
  // improvement passes take the rest by the share of the time box spent.
  onProgress?: (fraction: number) => void
}

const CONSTRUCTION_SHARE = 0.8
// A report is sent only when the fraction has moved this far since the last one.
const REPORT_STEP = 0.005

// A flipped visit; a closed loop has one way to be travelled.
const flip = (v: Visit): Visit => (v.node.closed ? v : { node: v.node, reversed: !v.reversed })
const forwardOnly = (v: Visit): Visit => (v.node.closed && v.reversed ? { node: v.node, reversed: false } : v)

// Nearest neighbour from home, then 2-opt (which also flips a single seam) and Or-opt on the seams that are not locked.
// Locked seams stay in their slot with their direction. The result is never costlier than the start order.
export function optimise(nodes: SequenceNode[], edge: EdgeCost, options: OptimiseOptions = {}): Visit[] {
  const n = nodes.length
  if (n === 0) return []
  const now = options.now ?? (() => performance.now())
  const timeBox = options.timeBoxMs ?? DEFAULT_TIME_BOX_MS
  const deadline = now() + timeBox
  let reported = -1
  const report = (fraction: number, force = false) => {
    if (!options.onProgress) return
    const next = Math.min(1, Math.max(reported, fraction, 0))
    if (force ? next === reported : next - reported < REPORT_STEP) return
    reported = next
    options.onProgress(next)
  }

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
    report((CONSTRUCTION_SHARE * constructed.length) / Math.max(free.length, 1))
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
  const m = sequence.length
  const expired = () => {
    const left = deadline - now()
    report(CONSTRUCTION_SHARE + (1 - CONSTRUCTION_SHARE) * (1 - Math.max(left, 0) / Math.max(timeBox, 1)))
    return left < 0
  }
  const prices = new TourPrices(slots, freeSlots, edge)
  prices.reset(sequence)

  // First improvement in a fixed order, as before; each candidate is priced from the edges it changes.
  let improved = true
  while (improved && m > 0 && !expired()) {
    improved = false
    // 2-opt: reverse the run i..j and flip each seam in it; i = j is a pure direction flip.
    for (let i = 0; i < m && !improved && !expired(); i++) {
      for (let j = i; j < m && !expired(); j++) {
        if (prices.reverseDelta(i, j) < -EPS) {
          sequence = [...sequence.slice(0, i), ...sequence.slice(i, j + 1).reverse().map(flip), ...sequence.slice(j + 1)]
          prices.reset(sequence)
          improved = true
          break
        }
      }
    }
    // Or-opt: move a run of one to three seams elsewhere, as it is or reversed.
    for (let len = 1; len <= Math.min(MAX_RUN, m - 1) && !improved && !expired(); len++) {
      for (let i = 0; i + len <= m && !improved && !expired(); i++) {
        for (let k = 0; k <= m - len && !expired(); k++) {
          if (k === i) continue
          const reversed = prices.moveDelta(i, len, k, false) < -EPS ? false : prices.moveDelta(i, len, k, true) < -EPS ? true : null
          if (reversed === null) continue
          const run = sequence.slice(i, i + len)
          const rest = [...sequence.slice(0, i), ...sequence.slice(i + len)]
          sequence = [...rest.slice(0, k), ...(reversed ? run.reverse().map(flip) : run), ...rest.slice(k)]
          prices.reset(sequence)
          improved = true
          break
        }
      }
    }
  }

  report(1, true)
  const result = assemble(sequence)
  const startOrder = base.map((v) => (v.node.locked ? v : forwardOnly(v)))
  return tourCost(result, edge) <= tourCost(startOrder, edge) + EPS ? result : startOrder
}

// The cost of the assembled tour, kept per edge so that a candidate move is priced from the edges it changes. Locked
// visits keep their slots, so a move of the free order changes the tour only from its first changed slot to its last.
// Every move is a few pieces of the old free order laid back into those slots: the interior of a piece comes from
// prefix sums (forward, or flipped for a reversed run), and only the edges at the ends of a piece and around a locked
// slot are costed again.
class TourPrices {
  private readonly slots: Array<Visit | null>
  private readonly freeSlots: number[]
  private readonly edge: EdgeCost
  private tour: Visit[] = []
  private free: Visit[] = []
  // into[x] is the cost of the edge that arrives at slot x; into[n] is the move home. intoSum is its prefix sum.
  private intoSum: number[] = []
  // Prefix sums over the free order of edge(free[u], free[u + 1]) and of edge(flip(free[u + 1]), flip(free[u])).
  private aheadSum: number[] = []
  private backSum: number[] = []

  constructor(slots: Array<Visit | null>, freeSlots: number[], edge: EdgeCost) {
    this.slots = slots
    this.freeSlots = freeSlots
    this.edge = edge
  }

  reset(sequence: Visit[]): void {
    const n = this.slots.length
    this.free = sequence
    this.tour = this.slots.map((s) => s) as Visit[]
    this.freeSlots.forEach((slot, k) => (this.tour[slot] = sequence[k]!))
    this.intoSum = [0]
    for (let x = 0; x <= n; x++) this.intoSum.push(this.intoSum[x]! + this.edge(this.at(x - 1), this.at(x)))
    this.aheadSum = [0]
    this.backSum = [0]
    for (let u = 0; u + 1 < sequence.length; u++) {
      this.aheadSum.push(this.aheadSum[u]! + this.edge(sequence[u]!, sequence[u + 1]!))
      this.backSum.push(this.backSum[u]! + this.edge(flip(sequence[u + 1]!), flip(sequence[u]!)))
    }
  }

  private at(x: number): Visit | null {
    return x < 0 || x >= this.tour.length ? null : this.tour[x]!
  }

  // Sum of the edges arriving at slots from to to, inclusive.
  private intoBetween(from: number, to: number): number {
    return to < from ? 0 : this.intoSum[to + 1]! - this.intoSum[from]!
  }

  // Cost change when free visits lo..hi become the pieces in order. Piece element e is free[start + e], or for a
  // reversed piece flip(free[start + len - 1 - e]).
  private spliceDelta(lo: number, hi: number, pieces: Array<{ start: number; len: number; reversed: boolean }>): number {
    const { free, freeSlots } = this
    const visit = (piece: (typeof pieces)[number], e: number): Visit =>
      piece.reversed ? flip(free[piece.start + piece.len - 1 - e]!) : free[piece.start + e]!
    // Edges between piece elements e0..e1, which sit in neighbouring slots.
    const inside = ({ start, len, reversed }: (typeof pieces)[number], e0: number, e1: number): number =>
      reversed ? this.backSum[start + len - 1 - e0]! - this.backSum[start + len - 1 - e1]! : this.aheadSum[start + e1]! - this.aheadSum[start + e0]!
    let total = 0
    let previous: Visit | null = this.at(freeSlots[lo]! - 1)
    let t = lo
    for (const piece of pieces) {
      for (let e0 = 0; e0 < piece.len; ) {
        // Grow the stretch while the next element of the piece lands in the very next slot.
        let e1 = e0
        while (e1 + 1 < piece.len && freeSlots[t + e1 - e0 + 1] === freeSlots[t + e1 - e0]! + 1) e1++
        const slot = freeSlots[t]!
        const first = visit(piece, e0)
        if (t > lo && freeSlots[t - 1]! + 1 < slot) {
          // Locked slots between the last free slot and this one: their own edges stay as they are.
          total += this.edge(previous, this.tour[freeSlots[t - 1]! + 1]!) + this.intoBetween(freeSlots[t - 1]! + 2, slot - 1)
          previous = this.tour[slot - 1]!
        }
        total += this.edge(previous, first) + inside(piece, e0, e1)
        previous = visit(piece, e1)
        t += e1 - e0 + 1
        e0 = e1 + 1
      }
    }
    total += this.edge(previous, this.at(freeSlots[hi]! + 1))
    return total - this.intoBetween(freeSlots[lo]!, freeSlots[hi]! + 1)
  }

  // Reverse the free run i..j and flip each visit in it.
  reverseDelta(i: number, j: number): number {
    return this.spliceDelta(i, j, [{ start: i, len: j - i + 1, reversed: true }])
  }

  // Take the free run i..i + len - 1 out and put it back before what is then free visit k, flipped when reversed.
  moveDelta(i: number, len: number, k: number, reversed: boolean): number {
    const run = { start: i, len, reversed }
    return k < i
      ? this.spliceDelta(k, i + len - 1, [run, { start: k, len: i - k, reversed: false }])
      : this.spliceDelta(i, k + len - 1, [{ start: i + len, len: k - i, reversed: false }, run])
  }
}
