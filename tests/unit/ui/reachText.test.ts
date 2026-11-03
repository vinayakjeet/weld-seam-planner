import { describe, expect, it } from 'vitest'
import { accessTitle, coverageText, reachLine, reachSummary } from '../../../src/ui/panels/reachText'
import { reachOf } from '../helpers/reach'

describe('coverageText', () => {
  it('writes a share as a whole percent', () => {
    expect(coverageText(0.734)).toBe('73 %')
    expect(coverageText(1)).toBe('100 %')
    expect(coverageText(0)).toBe('0 %')
  })

  it('never rounds a short of full share up to 100 %', () => {
    expect(coverageText(0.996)).toBe('99 %')
  })

  it('never shows a share above 0 as 0 %', () => {
    expect(coverageText(0.002)).toBe('1 %')
  })
})

describe('reachLine', () => {
  it('names the share and the port', () => {
    expect(reachLine(reachOf(0.734), 'snake')).toBe('73 % reached from P1')
  })

  it('says nothing was reached when the coverage is 0', () => {
    expect(reachLine(reachOf(0, [[0, 100]]), 'snake')).toBe('Not reached from any port')
  })

  it('says reach was not run when a snake seam has no current result', () => {
    expect(reachLine(null, 'snake')).toBe('Reach not run')
  })

  it('is empty for the other classes and for a seam with no class', () => {
    for (const cls of ['standard', 'slim', 'blocked', null] as const) expect(reachLine(reachOf(0.5), cls)).toBe('')
    expect(reachLine(null, null)).toBe('')
  })
})

describe('accessTitle', () => {
  it('joins the class and the reach line for the Acc tooltip', () => {
    expect(accessTitle('snake', reachOf(0.734))).toBe('Snake, 73 % reached from P1')
    expect(accessTitle('snake', null)).toBe('Snake, reach not run')
    expect(accessTitle('snake', reachOf(0))).toBe('Snake, not reached from any port')
    expect(accessTitle('slim', null)).toBe('Slim')
    expect(accessTitle(null, null)).toBe('')
  })
})

describe('reachSummary', () => {
  it('counts the seams measured, the ones fully reached and the mean coverage', () => {
    expect(reachSummary([1, 0.5, 0])).toBe('3 snake seams measured: 1 fully reached, mean coverage 50 %.')
  })

  it('agrees in number for one seam', () => {
    expect(reachSummary([1])).toBe('1 snake seam measured: 1 fully reached, mean coverage 100 %.')
  })

  it('is empty with nothing measured', () => {
    expect(reachSummary([])).toBe('')
  })
})
