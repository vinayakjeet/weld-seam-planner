import { describe, expect, it } from 'vitest'
import { selectStats, visibleSeams } from '../../../src/state/selectors'
import { corner, partInfo, seam } from '../helpers/state'

describe('selectStats', () => {
  it('is all zeros with no part and no seams', () => {
    expect(selectStats({ part: null, seams: [], statusById: {}, showCorners: false })).toEqual({
      triangles: 0,
      bodies: 0,
      accepted: 0,
      candidates: 0,
      acceptedLengthMm: 0,
      hiddenAccepted: 0,
    })
  })

  it('counts candidates and sums the accepted weld length', () => {
    const seams = [seam('a', 0.9, 200), seam('b', 0.9, 200), seam('c', 0.5, 35)]
    const part = partInfo({ triangles: 1234, bodies: 3 })
    expect(selectStats({ part, seams, statusById: {}, showCorners: false })).toMatchObject({ triangles: 1234, bodies: 3, accepted: 0, candidates: 3 })
    const accepted = selectStats({ part, seams, statusById: { a: 'accepted', b: 'accepted' }, showCorners: false })
    expect(accepted).toMatchObject({ accepted: 2, candidates: 1, acceptedLengthMm: 400 })
  })

  it('counts rejected seams as neither accepted nor candidate', () => {
    const stats = selectStats({ part: null, seams: [seam('a'), seam('b')], statusById: { a: 'rejected' }, showCorners: false })
    expect(stats).toMatchObject({ accepted: 0, candidates: 1, acceptedLengthMm: 0 })
  })

  it('counts accepted ids that are absent from the current seams as hidden, not as accepted', () => {
    const stats = selectStats({
      part: null,
      seams: [seam('b', 0.9, 100)],
      statusById: { a: 'accepted', b: 'accepted', z: 'rejected' },
      showCorners: false,
    })
    expect(stats).toMatchObject({ accepted: 1, hiddenAccepted: 1, acceptedLengthMm: 100 })
  })
})

describe('visibleSeams', () => {
  const seams = [seam('a'), corner('c'), seam('b')]

  it('leaves out hidden corner candidates by default', () => {
    expect(visibleSeams(seams, false).map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('lists them, in order, once corners are shown', () => {
    expect(visibleSeams(seams, true).map((s) => s.id)).toEqual(['a', 'c', 'b'])
  })

  it('returns the same array when nothing is hidden', () => {
    const all = [seam('a'), seam('b')]
    expect(visibleSeams(all, false)).toBe(all)
  })
})

describe('selectStats with corner candidates', () => {
  const seams = [seam('a', 0.9, 200), corner('c', 0.9, 100)]

  it('leaves hidden corners out of the candidate count', () => {
    expect(selectStats({ part: null, seams, statusById: {}, showCorners: false })).toMatchObject({ candidates: 1, accepted: 0 })
  })

  it('counts them once they are shown', () => {
    const stats = selectStats({ part: null, seams, statusById: { c: 'accepted' }, showCorners: true })
    expect(stats).toMatchObject({ candidates: 1, accepted: 1, acceptedLengthMm: 100 })
  })

  it('does not count an accepted corner while it is hidden, and does not call it hidden by the angle', () => {
    const stats = selectStats({ part: null, seams, statusById: { c: 'accepted' }, showCorners: false })
    expect(stats).toMatchObject({ accepted: 0, acceptedLengthMm: 0, hiddenAccepted: 0 })
  })
})
