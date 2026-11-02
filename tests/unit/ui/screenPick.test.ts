import { describe, expect, it } from 'vitest'
import { nearestScreenIndex } from '../../../src/ui/tools/screenPick'

const pts = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 150, y: 0 }]

describe('nearestScreenIndex', () => {
  it('picks the sample closest to the cursor', () => {
    expect(nearestScreenIndex(pts, { x: 48, y: 5 }, 20)).toBe(1)
    expect(nearestScreenIndex(pts, { x: 140, y: -3 }, 20)).toBe(3)
  })

  it('gives null when every sample is further than the radius', () => {
    expect(nearestScreenIndex(pts, { x: 25, y: 40 }, 20)).toBeNull()
  })

  it('counts a sample exactly at the radius as picked', () => {
    expect(nearestScreenIndex(pts, { x: 20, y: 0 }, 20)).toBe(0)
  })

  it('takes the first of two equally close samples', () => {
    expect(nearestScreenIndex(pts, { x: 25, y: 0 }, 30)).toBe(0)
  })

  it('skips samples that are not on screen (not finite) and handles an empty list', () => {
    const odd = [{ x: Number.NaN, y: 0 }, { x: 10, y: 0 }]
    expect(nearestScreenIndex(odd, { x: 0, y: 0 }, 50)).toBe(1)
    expect(nearestScreenIndex([], { x: 0, y: 0 }, 50)).toBeNull()
  })
})
