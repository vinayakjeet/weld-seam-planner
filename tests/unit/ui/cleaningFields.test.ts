import { describe, expect, it } from 'vitest'
import { cleaningEveryText, parseCleaningEvery, parseCleaningTime } from '../../../src/ui/panels/cleaningFields'

const DASHES = new RegExp('[\\u2013\\u2014]')

describe('parseCleaningEvery', () => {
  it('reads minutes of arc time and gives seconds', () => {
    expect(parseCleaningEvery('30')).toEqual({ seconds: 1800 })
    expect(parseCleaningEvery(' 12,5 ')).toEqual({ seconds: 750 })
    expect(parseCleaningEvery('0')).toEqual({ seconds: 0 })
  })

  it('refuses text that is not a number, and says what to type', () => {
    for (const bad of ['', 'abc', '1 2', 'NaN', 'Infinity']) {
      const result = parseCleaningEvery(bad)
      expect('error' in result, bad).toBe(true)
      if ('error' in result) {
        expect(result.error.what).toMatch(/cleaning/i)
        expect(result.error.next).toMatch(/minutes/i)
      }
    }
  })
})

describe('parseCleaningTime', () => {
  it('reads seconds', () => {
    expect(parseCleaningTime('45')).toEqual({ seconds: 45 })
    expect(parseCleaningTime('7,5')).toEqual({ seconds: 7.5 })
  })

  it('refuses text that is not a number', () => {
    const result = parseCleaningTime('soon')
    expect('error' in result && result.error.next).toMatch(/seconds/i)
  })
})

describe('cleaningEveryText', () => {
  it('shows seconds as minutes without trailing zeros, and 0 for none', () => {
    expect(cleaningEveryText(0)).toBe('0')
    expect(cleaningEveryText(1800)).toBe('30')
    expect(cleaningEveryText(750)).toBe('12.5')
    expect(cleaningEveryText(100)).toBe('1.67')
  })
})

describe('messages', () => {
  it('use no dash characters', () => {
    const results = [parseCleaningEvery('x'), parseCleaningTime('x')]
    for (const r of results) if ('error' in r) expect(JSON.stringify(r.error)).not.toMatch(DASHES)
  })
})
