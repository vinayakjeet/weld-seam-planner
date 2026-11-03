import type { EdgeCost, SequenceNode, Visit } from '../../../src/core/sequence/types'

// Held-Karp over (seam, end) states: the same optimum as trying every order and direction, fast enough for 8 seams.
// Closed loops have one entry, as in the optimiser.
export function exactOptimum(nodes: SequenceNode[], edge: EdgeCost): number {
  const n = nodes.length
  if (n === 0) return 0
  const visit = (state: number): Visit => ({ node: nodes[state >> 1]!, reversed: (state & 1) === 1 })
  const allowed = (state: number) => !(nodes[state >> 1]!.closed && (state & 1) === 1)
  const states = 2 * n
  const full = (1 << n) - 1
  const dp: number[][] = Array.from({ length: full + 1 }, () => new Array<number>(states).fill(Infinity))
  for (let s = 0; s < states; s++) if (allowed(s)) dp[1 << (s >> 1)]![s] = edge(null, visit(s))
  for (let mask = 1; mask <= full; mask++) {
    for (let last = 0; last < states; last++) {
      const here = dp[mask]![last]!
      if (!isFinite(here)) continue
      for (let next = 0; next < states; next++) {
        const bit = 1 << (next >> 1)
        if (!allowed(next) || mask & bit) continue
        const cost = here + edge(visit(last), visit(next))
        if (cost < dp[mask | bit]![next]!) dp[mask | bit]![next] = cost
      }
    }
  }
  let best = Infinity
  for (let s = 0; s < states; s++) best = Math.min(best, dp[full]![s]! + edge(visit(s), null))
  return best
}
