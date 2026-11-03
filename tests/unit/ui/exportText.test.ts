import { describe, expect, it } from 'vitest'
import { jobFilename, rapidFilename, summaryText } from '../../../src/ui/shell/exportText'

describe('jobFilename', () => {
  it('lowercases the part name, drops the .stl extension and takes the date from createdAt', () => {
    expect(jobFilename('Double Bottom Cell.STL', '2026-11-04T10:15:00Z')).toBe('weldjob-double-bottom-cell-2026-11-04.json')
  })

  it('collapses runs of other characters into one dash and trims the ends', () => {
    expect(jobFilename('  __T-Joint (v2)__.stl', '2026-01-02T00:00:00Z')).toBe('weldjob-t-joint-v2-2026-01-02.json')
  })

  it('falls back to "part" when the name has no letters or digits', () => {
    expect(jobFilename('---.stl', '2026-11-04T10:15:00Z')).toBe('weldjob-part-2026-11-04.json')
    expect(jobFilename('', '2026-11-04T10:15:00Z')).toBe('weldjob-part-2026-11-04.json')
  })
})

describe('rapidFilename', () => {
  it('uses the job file stem with a .mod extension', () => {
    expect(rapidFilename('tank-with-manhole.stl', '2026-11-03T10:00:00Z')).toBe('weldjob-tank-with-manhole-2026-11-03.mod')
  })
})

const summary = { seamCount: 3, weldLengthMm: 1234.5, arcTimeS: 125, airTimeS: 20, cycleTimeS: 150.4, wireKg: 0.1312, gasL: 22.5 }

describe('summaryText', () => {
  it('follows the one line format with metres, minutes and seconds', () => {
    expect(summaryText('cell.stl', summary, { errors: 0, warnings: 2 })).toBe(
      'cell.stl: 3 seams, 1.23 m of weld, arc 2 min 5 s, cycle 2 min 30 s, wire 0.13 kg, gas 23 L. Pre-flight: 0 errors, 2 warnings.',
    )
  })

  it('carries a second that rounds up to 60 into the minutes', () => {
    const text = summaryText('a.stl', { ...summary, arcTimeS: 59.6, cycleTimeS: 119.7 }, { errors: 1, warnings: 0 })
    expect(text).toContain('arc 1 min 0 s, cycle 2 min 0 s')
  })
})
