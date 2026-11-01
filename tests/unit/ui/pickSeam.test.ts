import { describe, expect, it } from 'vitest'
import { chooseSeamHit, type SeamLineHit } from '../../../src/ui/viewport/pickSeam'

// Segments 0..2 belong to seam 0, segments 3..5 to seam 1, segment 6 to seam 2.
const segmentSeam = Uint32Array.from([0, 0, 0, 1, 1, 1, 2])

const visible = (segment: number, distance: number): SeamLineHit => ({ segment, distance, occluderDistance: null })

describe('chooseSeamHit', () => {
  it('returns null when nothing was hit', () => {
    expect(chooseSeamHit([], segmentSeam, 1)).toBeNull()
  })

  it('maps the hit segment to its seam', () => {
    expect(chooseSeamHit([visible(4, 500)], segmentSeam, 1)).toBe(1)
    expect(chooseSeamHit([visible(6, 500)], segmentSeam, 1)).toBe(2)
  })

  it('picks the seam nearest the camera when several are under the cursor', () => {
    const hits = [visible(1, 700), visible(4, 400), visible(6, 900)]
    expect(chooseSeamHit(hits, segmentSeam, 1)).toBe(1)
  })

  it('ignores a seam with the part in front of it', () => {
    const hits: SeamLineHit[] = [{ segment: 1, distance: 600, occluderDistance: 450 }, visible(6, 900)]
    expect(chooseSeamHit(hits, segmentSeam, 1)).toBe(2)
  })

  it('returns null when every seam under the cursor is behind the part', () => {
    const hits: SeamLineHit[] = [
      { segment: 1, distance: 600, occluderDistance: 450 },
      { segment: 4, distance: 650, occluderDistance: 450 },
    ]
    expect(chooseSeamHit(hits, segmentSeam, 1)).toBeNull()
  })

  it('treats a seam lying on the surface as visible, within the tolerance', () => {
    const onSurface: SeamLineHit = { segment: 3, distance: 600, occluderDistance: 599.4 }
    expect(chooseSeamHit([onSurface], segmentSeam, 1)).toBe(1)
    expect(chooseSeamHit([{ ...onSurface, occluderDistance: 598.9 }], segmentSeam, 1)).toBeNull()
  })

  it('returns null for a segment that has no seam, instead of a wrong one', () => {
    expect(chooseSeamHit([visible(99, 500)], segmentSeam, 1)).toBeNull()
  })

  it('does not depend on the order of the hits', () => {
    const hits = [visible(6, 900), visible(1, 700), visible(4, 400)]
    expect(chooseSeamHit(hits, segmentSeam, 1)).toBe(1)
    expect(chooseSeamHit([...hits].reverse(), segmentSeam, 1)).toBe(1)
  })
})
