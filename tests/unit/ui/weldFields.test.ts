import { describe, expect, it } from 'vitest'
import { DEFAULT_WELD_TOLERANCE } from '../../../src/core/mesh/weld'
import { parseWeldMm, weldMmText, weldRangeText } from '../../../src/ui/panels/weldFields'

const DIAGONAL = 250

describe('weldMmText', () => {
  it('shows the default tolerance in mm of this part', () => {
    expect(weldMmText(DEFAULT_WELD_TOLERANCE, DIAGONAL)).toBe('0.0025')
  })

  it('keeps three significant figures', () => {
    expect(weldMmText(5e-4, 222.2)).toBe('0.111')
    expect(weldMmText(1e-3, 3000)).toBe('3')
  })
})

describe('weldRangeText', () => {
  it('gives both ends in mm and as a fraction of the diagonal', () => {
    expect(weldRangeText(DIAGONAL)).toBe('0.00025 to 0.25 mm for this part (1e-6 to 1e-3 of its 250 mm diagonal)')
  })
})

describe('parseWeldMm', () => {
  it('turns mm into a fraction of the diagonal', () => {
    expect(parseWeldMm('0.125', DIAGONAL)).toEqual({ weldTolerance: 5e-4 })
  })

  it('accepts a comma for the decimal point and spaces around the number', () => {
    expect(parseWeldMm(' 0,125 ', DIAGONAL)).toEqual({ weldTolerance: 5e-4 })
  })

  it('takes the ends of the range, and rounding just outside them', () => {
    expect(parseWeldMm('0.25', DIAGONAL)).toEqual({ weldTolerance: 1e-3 })
    expect(parseWeldMm('0.00025', DIAGONAL)).toEqual({ weldTolerance: 1e-6 })
    expect(parseWeldMm('0.2501', DIAGONAL)).toEqual({ weldTolerance: 1e-3 })
  })

  it.each([['text', 'abc'], ['empty', ''], ['too small', '0.0001'], ['too large', '0.3'], ['negative', '-0.1']])('explains %s', (_name, text) => {
    const result = parseWeldMm(text, DIAGONAL)
    expect('error' in result).toBe(true)
    if ('error' in result) for (const part of Object.values(result.error)) expect(part.trim().length).toBeGreaterThan(0)
  })

  it('names the range for this part in the explanation of a value outside it', () => {
    const result = parseWeldMm('0.3', DIAGONAL)
    if (!('error' in result)) throw new Error('expected an error')
    expect(result.error.why).toContain('0.00025 to 0.25 mm')
  })
})
