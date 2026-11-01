import { describe, expect, it } from 'vitest'
import { selectStats } from '../../../src/state/selectors'
import { partInfo, seam } from '../helpers/state'

describe('selectStats', () => {
  it('is all zeros with no part and no seams', () => {
    expect(selectStats({ part: null, seams: [], statusById: {} })).toEqual({
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
    expect(selectStats({ part, seams, statusById: {} })).toMatchObject({ triangles: 1234, bodies: 3, accepted: 0, candidates: 3 })
    const accepted = selectStats({ part, seams, statusById: { a: 'accepted', b: 'accepted' } })
    expect(accepted).toMatchObject({ accepted: 2, candidates: 1, acceptedLengthMm: 400 })
  })

  it('counts rejected seams as neither accepted nor candidate', () => {
    const stats = selectStats({ part: null, seams: [seam('a'), seam('b')], statusById: { a: 'rejected' } })
    expect(stats).toMatchObject({ accepted: 0, candidates: 1, acceptedLengthMm: 0 })
  })

  it('counts accepted ids that are absent from the current seams as hidden, not as accepted', () => {
    const stats = selectStats({
      part: null,
      seams: [seam('b', 0.9, 100)],
      statusById: { a: 'accepted', b: 'accepted', z: 'rejected' },
    })
    expect(stats).toMatchObject({ accepted: 1, hiddenAccepted: 1, acceptedLengthMm: 100 })
  })
})
