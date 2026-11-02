import { describe, expect, it } from 'vitest'
import { pointsFromPolyline } from '../../../src/core/seams/frames'
import type { SeamCandidate } from '../../../src/core/seams/detect'
import { mergeTargets } from '../../../src/ui/tools/mergeTargets'
import { seam } from '../helpers/state'

const line = (id: string, from: number, to: number, y = 0): SeamCandidate => {
  const { points, lengthMm } = pointsFromPolyline([[from, y, 0], [to, y, 0]], false, () => [[0, 1, 0], [0, 0, 1]])
  return seam(id, 0.8, lengthMm, { points })
}

describe('mergeTargets', () => {
  const a = line('a', 0, 200)

  it('lists seams whose end touches an end of the started seam', () => {
    expect(mergeTargets(a, [a, line('b', 200, 300), line('c', 400, 500), line('d', -100, 0)], 1)).toEqual(['b', 'd'])
  })

  it('finds a seam that runs the other way round', () => {
    expect(mergeTargets(a, [line('r', 300, 200)], 1)).toEqual(['r'])
  })

  it('uses the tolerance: a gap of 0.9 mm touches, 1.1 mm does not', () => {
    expect(mergeTargets(a, [line('near', 200.9, 300), line('far', 201.1, 300)], 1)).toEqual(['near'])
  })

  it('never lists the started seam itself, and lists nothing for an empty list', () => {
    expect(mergeTargets(a, [a], 1)).toEqual([])
    expect(mergeTargets(a, [], 1)).toEqual([])
  })

  it('agrees with the merge itself: seams the merge would refuse are not targets', () => {
    const loop = { ...line('loop', 200, 300), closed: true }
    expect(mergeTargets(a, [loop], 1)).toEqual([])
  })
})
