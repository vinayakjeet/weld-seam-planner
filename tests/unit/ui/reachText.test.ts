import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { accessTitle, coverageText, REACH_LEGEND, reachLine, reachSummary, staleReachText } from '../../../src/ui/panels/reachText'
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

describe('REACH_LEGEND', () => {
  const tokens = readFileSync(fileURLToPath(new URL('../../../src/styles/tokens.css', import.meta.url)), 'utf8')
  // The token a reach colour points to, followed to its hex value, and the name of its hue.
  const hexOf = (name: string): string => {
    const value = new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)![1]!.trim()
    const ref = /^var\((--[\w-]+)\)$/.exec(value)
    return ref ? hexOf(ref[1]!) : value
  }
  const hueName = (hex: string): string => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
    const max = Math.max(r, g, b)
    const d = max - Math.min(r, g, b)
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    const hue = (h * 60 + 360) % 360
    return hue < 20 || hue >= 340 ? 'red' : hue < 70 ? 'orange' : hue < 170 ? 'green' : hue < 260 ? 'blue' : 'purple'
  }

  it('names the colours the seams are drawn in once reach has run', () => {
    expect(hueName(hexOf('--reach-ok'))).toBe('green')
    expect(hueName(hexOf('--reach-miss'))).toBe('red')
    expect(REACH_LEGEND).toContain(`coloured ${hueName(hexOf('--reach-ok'))} where the arm reaches them`)
    expect(REACH_LEGEND).toContain(`${hueName(hexOf('--reach-miss'))} where it does not`)
  })
})

describe('staleReachText', () => {
  it('counts the seams whose result is from the old ports or arm, and says how to update them', () => {
    expect(staleReachText(19)).toBe('19 seams still have results from the old ports or arm. Run reach on all snake seams to update them.')
  })

  it('writes one seam in the singular', () => {
    expect(staleReachText(1)).toBe('1 seam still has a result from the old ports or arm. Run reach on all snake seams to update it.')
  })

  it('is empty when no seam is out of date', () => {
    expect(staleReachText(0)).toBe('')
  })
})
