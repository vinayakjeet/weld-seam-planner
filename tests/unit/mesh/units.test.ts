import { describe, expect, it } from 'vitest'
import { guessUnits } from '../../../src/core/mesh/units'

describe('guessUnits', () => {
  it('treats parts of 10 or more across as millimetres', () => {
    expect(guessUnits(10)).toBe('mm')
    expect(guessUnits(450)).toBe('mm')
  })

  it('guesses inches for parts between 1 and 10 across', () => {
    expect(guessUnits(1)).toBe('in')
    expect(guessUnits(9.99)).toBe('in')
  })

  it('guesses metres for parts between 1 mm and 1 unit across', () => {
    expect(guessUnits(0.001)).toBe('m')
    expect(guessUnits(0.8)).toBe('m')
  })

  it('returns unknown for empty, negative, non-finite or tiny extents', () => {
    expect(guessUnits(0)).toBe('unknown')
    expect(guessUnits(-5)).toBe('unknown')
    expect(guessUnits(Number.NaN)).toBe('unknown')
    expect(guessUnits(Number.POSITIVE_INFINITY)).toBe('unknown')
    expect(guessUnits(0.0001)).toBe('unknown')
  })
})
