import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../../../src/core/math/vec3'
import { airMoveMm } from '../../../src/core/sequence/air'
import { airLengthMm } from '../../../src/core/sequence/tsp'
import type { SequenceNode, Visit } from '../../../src/core/sequence/types'

const HOME: Vec3 = [0, 0, 0]
const LEAD = 10

// Two seams whose torch points are placed so every leg is a 3-4-5 triangle.
function node(id: string, enter: Vec3, leave: Vec3): SequenceNode {
  const both = { forward: enter, reverse: enter }
  return {
    id,
    closed: false,
    locked: false,
    mid: enter,
    enter: both,
    leave: { forward: leave, reverse: leave },
    arcStart: both,
    arcEnd: { forward: leave, reverse: leave },
  }
}

describe('airMoveMm', () => {
  it('counts the lead once on the home leg that meets a seam', () => {
    expect(airMoveMm(null, [3, 4, 0], HOME, LEAD)).toBe(5 + LEAD)
    expect(airMoveMm([6, 8, 0], null, HOME, LEAD)).toBe(LEAD + 10)
  })

  it('counts one lead for the retract and one for the approach between seams', () => {
    expect(airMoveMm([0, 0, 0], [0, 30, 40], HOME, LEAD)).toBe(LEAD + 50 + LEAD)
  })

  it('is zero for home to home', () => {
    expect(airMoveMm(null, null, HOME, LEAD)).toBe(0)
  })

  it('gives the tour length by hand: 15 + 70 + 20 = 105 mm', () => {
    const a = node('a', [3, 4, 0], [6, 8, 0])
    const b = node('b', [6, 38, 40], [6, 8, 0])
    const tour: Visit[] = [{ node: a, reversed: false }, { node: b, reversed: false }]
    // home to a: 5 + 10. a to b: 10 + |(0,30,40)| + 10 = 70. b to home: 10 + 10.
    expect(airLengthMm(tour, HOME, LEAD)).toBe(15 + 70 + 20)
  })
})
