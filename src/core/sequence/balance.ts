import { dot, length, sub, type Vec3 } from '../math/vec3'
import { airEdge } from './tsp'
import type { EdgeCost, SequenceNode, Visit } from './types'

// Penalties are in mm of air travel, so they trade directly against the distance the torch flies.
export const BALANCE = {
  // Spec: seams closer than R = 300 mm one after the other pile heat into the same region.
  proximityRadiusMm: 300,
  // Per mm that consecutive seam midpoints are closer than the radius.
  proximityWeight: 1,
  // Flat charge when two consecutive seams lie on the same side of the part about both principal axes.
  sameSideMm: 150,
  // Per mm that the next seam is nearer the centre than the previous one: the order should work outward.
  centreOutWeight: 0.5,
  // Never strike the arc this close to where the previous weld stopped.
  endOverlapMm: 10,
  endOverlapPenaltyMm: 5000,
}

export type BalanceParams = typeof BALANCE

type Mat = number[][]

// Jacobi rotations on a symmetric 3x3 matrix: eigenvalues on the diagonal, eigenvectors as the columns of v.
function jacobi(a: Mat): { values: number[]; v: Mat } {
  const v: Mat = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  for (let sweep = 0; sweep < 50; sweep++) {
    let moved = false
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      const apq = a[p]![q]!
      if (Math.abs(apq) < 1e-12) continue
      moved = true
      const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq)
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1)
      const s = t * c
      for (let k = 0; k < 3; k++) {
        const akp = a[k]![p]!
        const akq = a[k]![q]!
        a[k]![p] = c * akp - s * akq
        a[k]![q] = s * akp + c * akq
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p]![k]!
        const aqk = a[q]![k]!
        a[p]![k] = c * apk - s * aqk
        a[q]![k] = s * apk + c * aqk
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k]![p]!
        const vkq = v[k]![q]!
        v[k]![p] = c * vkp - s * vkq
        v[k]![q] = s * vkp + c * vkq
      }
    }
    if (!moved) break
  }
  return { values: [a[0]![0]!, a[1]![1]!, a[2]![2]!], v }
}

// The mean of the points and the axes of their spread, longest first. Each axis is unit length with its largest
// component positive, so the answer does not depend on the order of the points. No spread gives the coordinate axes.
export function principalAxes(points: Vec3[]): { centre: Vec3; axes: [Vec3, Vec3, Vec3] } {
  const n = points.length
  const centre: Vec3 = [0, 0, 0]
  for (const p of points) for (let c = 0; c < 3; c++) centre[c] = centre[c]! + p[c]! / Math.max(n, 1)
  const cov: Mat = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (const p of points) {
    const d = sub(p, centre)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i]![j] = cov[i]![j]! + d[i]! * d[j]!
  }
  const { values, v } = jacobi(cov)
  const order = [0, 1, 2].sort((i, j) => values[j]! - values[i]! || i - j)
  const axes = order.map((i): Vec3 => {
    const axis: Vec3 = [v[0]![i]!, v[1]![i]!, v[2]![i]!]
    const big = [0, 1, 2].reduce((best, c) => (Math.abs(axis[c]!) > Math.abs(axis[best]!) + 1e-12 ? c : best), 0)
    return axis[big]! < 0 ? [-axis[0], -axis[1], -axis[2]] : axis
  })
  return { centre, axes: [axes[0]!, axes[1]!, axes[2]!] }
}

const arcEndOf = (v: Visit): Vec3 => (v.reversed ? v.node.arcEnd.reverse : v.node.arcEnd.forward)
const arcStartOf = (v: Visit): Vec3 => (v.reversed ? v.node.arcStart.reverse : v.node.arcStart.forward)

// The air move cost plus the balance terms. Every term depends only on the two seams of the move, so the same
// optimiser as for minimum air travel finds the order. Home moves carry no extra charge.
export function balancedEdge(nodes: SequenceNode[], home: Vec3, leadMm: number, params: Partial<BalanceParams> = {}): EdgeCost {
  const p = { ...BALANCE, ...params }
  const air = airEdge(home, leadMm)
  const { centre, axes } = principalAxes(nodes.map((n) => n.mid))
  const sideOf = (node: SequenceNode): number => {
    const d = sub(node.mid, centre)
    return (dot(d, axes[0]) >= 0 ? 1 : 0) + (dot(d, axes[1]) >= 0 ? 2 : 0)
  }
  const radiusOf = (node: SequenceNode): number => length(sub(node.mid, centre))

  return (from, to) => {
    const base = air(from, to)
    if (from === null || to === null) return base
    let extra = 0
    const apart = length(sub(from.node.mid, to.node.mid))
    if (apart < p.proximityRadiusMm) extra += p.proximityWeight * (p.proximityRadiusMm - apart)
    if (sideOf(from.node) === sideOf(to.node)) extra += p.sameSideMm
    const inward = radiusOf(from.node) - radiusOf(to.node)
    if (inward > 0) extra += p.centreOutWeight * inward
    if (length(sub(arcEndOf(from), arcStartOf(to))) < p.endOverlapMm) extra += p.endOverlapPenaltyMm
    return base + extra
  }
}

