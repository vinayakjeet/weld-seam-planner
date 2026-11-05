import { describe, expect, it } from 'vitest'
import { nearestScreenIndex, nearestVisibleScreenIndex } from '../../../src/ui/tools/screenPick'

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

describe('nearestVisibleScreenIndex', () => {
  it('gives the nearest sample when every sample is visible', () => {
    expect(nearestVisibleScreenIndex(pts, { x: 48, y: 5 }, 20, () => true)).toBe(1)
  })

  it('passes over a nearer sample that is hidden and takes the nearest one that is visible', () => {
    expect(nearestVisibleScreenIndex(pts, { x: 55, y: 0 }, 60, (i) => i !== 1)).toBe(2)
  })

  it('gives null when every sample in reach is hidden, rather than a hidden one', () => {
    expect(nearestVisibleScreenIndex(pts, { x: 55, y: 0 }, 60, () => false)).toBeNull()
  })

  it('does not ask about a sample outside the radius', () => {
    const asked: number[] = []
    nearestVisibleScreenIndex(pts, { x: 0, y: 0 }, 20, (i) => {
      asked.push(i)
      return true
    })
    expect(asked).toEqual([0])
  })

  it('asks about the nearest first and stops at the first visible one', () => {
    const asked: number[] = []
    nearestVisibleScreenIndex(pts, { x: 60, y: 0 }, 200, (i) => {
      asked.push(i)
      return i === 2
    })
    expect(asked).toEqual([1, 2])
  })

  it('asks about at most the given number of candidates', () => {
    const asked: number[] = []
    const many = Array.from({ length: 100 }, (_, i) => ({ x: i, y: 0 }))
    expect(
      nearestVisibleScreenIndex(
        many,
        { x: 0, y: 0 },
        1000,
        (i) => {
          asked.push(i)
          return false
        },
        10,
      ),
    ).toBeNull()
    expect(asked).toHaveLength(10)
  })

  it('skips samples that are not on screen', () => {
    expect(nearestVisibleScreenIndex([{ x: Number.NaN, y: 0 }, { x: 10, y: 0 }], { x: 0, y: 0 }, 50, () => true)).toBe(1)
  })
})
