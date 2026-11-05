import { describe, expect, it } from 'vitest'
import { initialTool } from '../../../src/ui/tools/toolMachine'
import {
  badTrimInput,
  fewPoints,
  missedMergeTarget,
  missedSeam,
  needSeamSelected,
  notATarget,
  parseTrimInput,
  toolHint,
} from '../../../src/ui/panels/manualText'

const DASHES = new RegExp('[\\u2013\\u2014]')
const EMOJI = /\p{Extended_Pictographic}/u

const refusals = [
  needSeamSelected('split'),
  needSeamSelected('merge'),
  needSeamSelected('reverse'),
  needSeamSelected('delete'),
  needSeamSelected('trim'),
  needSeamSelected('accept'),
  needSeamSelected('reject'),
  fewPoints(0),
  fewPoints(1),
  missedSeam(),
  missedMergeTarget('S1'),
  notATarget('S3', 'S1'),
  badTrimInput('abc', ''),
]

describe('manualText refusals', () => {
  it('say what happened, why and what to do next, each as a sentence', () => {
    for (const error of refusals) {
      for (const part of [error.what, error.why, error.next]) {
        expect(part.trim().length).toBeGreaterThan(10)
        expect(part).toMatch(/[.!?]$/)
      }
    }
  })

  it('use no em dash, en dash or emoji', () => {
    for (const error of refusals) {
      for (const part of [error.what, error.why, error.next]) {
        expect(part).not.toMatch(DASHES)
        expect(part).not.toMatch(EMOJI)
      }
    }
  })

  it('name the action that needs a selection', () => {
    expect(needSeamSelected('split').what).toMatch(/split/i)
    expect(needSeamSelected('delete').what).toMatch(/delete/i)
  })

  it('count the clicks in the not enough points message', () => {
    expect(fewPoints(0).why).toMatch(/0 /)
    expect(fewPoints(1).why).toMatch(/1 was|only 1/)
  })

  it('name both seams when a merge target does not touch', () => {
    const error = notATarget('S3', 'S1')
    expect(`${error.what} ${error.why}`).toMatch(/S3/)
    expect(`${error.what} ${error.why}`).toMatch(/S1/)
  })

  it('name the seam the merge started from when the click hit no seam', () => {
    expect(missedMergeTarget('D1a').what).toMatch(/merge/i)
    expect(`${missedMergeTarget('D1a').why} ${missedMergeTarget('D1a').next}`).toMatch(/D1a/)
  })

  it('quote what was typed in the trim message', () => {
    expect(badTrimInput('abc', '').why).toMatch(/abc/)
  })
})

describe('toolHint', () => {
  it('is empty for select, so the status bar falls back to its own note', () => {
    expect(toolHint(initialTool)).toBeNull()
  })

  it('tells the key for every step of drawing', () => {
    const hint = toolHint({ tool: 'draw', points: [] })!
    for (const word of ['Click', 'Enter', 'Backspace', 'Esc']) expect(hint).toContain(word)
  })

  it('counts the points placed so far', () => {
    const point = { p: [0, 0, 0] as [number, number, number], face: -1 }
    expect(toolHint({ tool: 'draw', points: [point, point] })).toMatch(/2 points/)
    expect(toolHint({ tool: 'draw', points: [point] })).toMatch(/1 point\b/)
  })

  it('describes split and merge, and uses no dashes', () => {
    expect(toolHint({ tool: 'split' })).toMatch(/split/i)
    expect(toolHint({ tool: 'merge', from: 'a' })).toMatch(/merge/i)
    expect(toolHint({ tool: 'merge', from: 'a' })).not.toMatch(/the selected one/)
    for (const state of [{ tool: 'split' as const }, { tool: 'merge' as const, from: 'a' }, { tool: 'draw' as const, points: [] }]) {
      expect(toolHint(state)).not.toMatch(DASHES)
    }
  })
})

describe('parseTrimInput', () => {
  it('reads millimetres from both boxes, and an empty box as zero', () => {
    expect(parseTrimInput('5', '3')).toEqual({ startMm: 5, endMm: 3 })
    expect(parseTrimInput('', ' 2.5 ')).toEqual({ startMm: 0, endMm: 2.5 })
    expect(parseTrimInput('', '')).toEqual({ startMm: 0, endMm: 0 })
  })

  it('refuses text, negative numbers and values that are not finite, quoting what was typed', () => {
    for (const [a, b] of [['abc', '1'], ['1', 'x2'], ['-1', '0'], ['0', '-0.5'], ['Infinity', '0'], ['NaN', '0']]) {
      const result = parseTrimInput(a!, b!)
      expect('what' in result).toBe(true)
    }
    const bad = parseTrimInput('abc', '1')
    expect('why' in bad && bad.why).toMatch(/abc/)
  })
})

