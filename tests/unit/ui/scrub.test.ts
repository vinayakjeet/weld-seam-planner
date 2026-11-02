import { describe, expect, it } from 'vitest'
import { nudgeScrub, scrubStep } from '../../../src/ui/panels/scrub'

describe('scrubStep', () => {
  it('is 1 mm for an arrow and 10 mm with Shift, signed by direction', () => {
    expect(scrubStep('ArrowRight', false)).toBe(1)
    expect(scrubStep('ArrowLeft', false)).toBe(-1)
    expect(scrubStep('ArrowRight', true)).toBe(10)
    expect(scrubStep('ArrowLeft', true)).toBe(-10)
  })

  it('treats up and down like right and left, and ignores other keys', () => {
    expect(scrubStep('ArrowUp', false)).toBe(1)
    expect(scrubStep('ArrowDown', true)).toBe(-10)
    expect(scrubStep('Enter', false)).toBeNull()
    expect(scrubStep('a', true)).toBeNull()
  })
})

describe('nudgeScrub', () => {
  it('moves along an open seam and stops at both ends', () => {
    expect(nudgeScrub(50, 1, 200, false)).toBe(51)
    expect(nudgeScrub(0.5, -1, 200, false)).toBe(0)
    expect(nudgeScrub(199, 10, 200, false)).toBe(200)
  })

  it('wraps round a closed loop', () => {
    expect(nudgeScrub(199, 10, 200, true)).toBe(9)
    expect(nudgeScrub(2, -10, 200, true)).toBe(192)
  })

  it('stays put for a seam of no length, and for a step that is not finite', () => {
    expect(nudgeScrub(0, 1, 0, false)).toBe(0)
    expect(nudgeScrub(5, Number.NaN, 200, false)).toBe(5)
  })
})
