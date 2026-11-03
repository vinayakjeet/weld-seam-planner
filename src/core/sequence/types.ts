import type { Vec3 } from '../math/vec3'

export const SEQUENCE_STRATEGIES = ['table-order', 'min-air-move', 'balanced-heat', 'manual'] as const

export type SequenceStrategy = (typeof SEQUENCE_STRATEGIES)[number]

// A value for travelling a seam along its stored points and for travelling it the other way.
export interface Dir<T> {
  forward: T
  reverse: T
}

// One seam as the optimiser sees it. enter and leave are the torch points of the air move (first approach and last
// retract, as the export computes them); arcStart and arcEnd are where the arc strikes and stops.
export interface SequenceNode {
  id: string
  closed: boolean
  locked: boolean
  mid: Vec3
  enter: Dir<Vec3>
  leave: Dir<Vec3>
  arcStart: Dir<Vec3>
  arcEnd: Dir<Vec3>
}

export interface Visit {
  node: SequenceNode
  reversed: boolean
}

// Cost of moving from one visit to the next; null stands for home on either side.
export type EdgeCost = (from: Visit | null, to: Visit | null) => number
