import { describe, expect, it } from 'vitest'
import { resolveSeam, type PlannedSeam, type ResolvedSeam } from '../../../src/core/job/plan'
import type { ProcedureOverrides } from '../../../src/core/job/schema'
import { legHints, defaultLegText, heatInputReadout, travelReadout } from '../../../src/ui/panels/calcText'
import { SPRAY_ID, specExamplePlan } from '../helpers/jobs'

const plan = specExamplePlan()

function resolved(thicknessMm: [number | null, number | null], overrides: ProcedureOverrides = {}, legMm: number | null = null, jointType: 'fillet' | 'lap' = 'fillet', procedureId = SPRAY_ID): ResolvedSeam {
  const base = plan.seams[0]!
  const planned: PlannedSeam = { ...base, seam: { ...base.seam, thicknessMm, jointType }, overrides, legMm, procedureId }
  return resolveSeam(plan, planned)
}

describe('heatInputReadout', () => {
  it('reads 0.67 kJ/mm for spray on 10 and 12 mm plates', () => {
    const r = heatInputReadout([resolved([10, 12])])!
    expect(r.text).toBe('0.67 kJ/mm')
    expect(r.level).toBe('ok')
    expect(r.reasons).toEqual([])
    expect(r.kJmm).toBeCloseTo(0.672, 3)
  })

  it('goes amber with the reason when the heat input is above 2.5', () => {
    const r = heatInputReadout([resolved([10, 12], { travelSpeedMmS: 2.2 })])!
    expect(r.level).toBe('amber')
    expect(r.reasons[0]).toContain('above 2.5 kJ/mm')
  })

  it('goes red with the reason when the heat input is above 3.5', () => {
    const r = heatInputReadout([resolved([10, 12], { travelSpeedMmS: 1.5 })])!
    expect(r.level).toBe('red')
    expect(r.reasons[0]).toContain('above 3.5 kJ/mm')
  })

  it('shows a range over a selection that differs, at the worst level', () => {
    const r = heatInputReadout([resolved([10, 12]), resolved([10, 12], { travelSpeedMmS: 1.5 })])!
    expect(r.text).toMatch(/^0\.67 to \d\.\d\d kJ\/mm$/)
    expect(r.level).toBe('red')
  })

  it('is null without a procedure', () => {
    const base = plan.seams[0]!
    expect(heatInputReadout([resolveSeam(plan, { ...base, procedureId: null })])).toBeNull()
    expect(heatInputReadout([])).toBeNull()
  })
})

describe('travelReadout', () => {
  it('reads the suggested speed in both units with the leg for spray on 10 and 12 mm plates', () => {
    const r = travelReadout([resolved([10, 12])])!
    expect(r.text).toBe('9.0 mm/s (543 mm/min) for a 6.0 mm leg')
    expect(r.level).toBe('ok')
  })

  it('goes amber and red with the reason against the set speed', () => {
    const amber = travelReadout([resolved([10, 12], { travelSpeedMmS: 11.6 }, 6)])!
    expect(amber.level).toBe('amber')
    expect(amber.reasons[0]).toContain('faster than the 9.0 mm/s')
    const red = travelReadout([resolved([10, 12], { travelSpeedMmS: 15 }, 6)])!
    expect(red.level).toBe('red')
  })

  it('follows a leg the user set', () => {
    expect(travelReadout([resolved([10, 12], {}, 7)])!.text).toBe('6.6 mm/s (399 mm/min) for a 7.0 mm leg')
  })

  it('gives a range over legs and speeds that differ', () => {
    const r = travelReadout([resolved([10, 12], {}, 5), resolved([10, 12], {}, 6)])!
    expect(r.text).toBe('9.0 to 13.0 mm/s for legs of 5.0 to 6.0 mm')
  })

  it('says it cannot check a procedure without a wire feed', () => {
    const base = plan.seams[0]!
    const gtaw = resolveSeam({ ...plan }, { ...base, procedureId: 'WPS-GTAW' })
    expect(travelReadout([gtaw])!.text).toBe('Not checked, this procedure has no wire feed speed')
    expect(travelReadout([gtaw])!.level).toBe('ok')
  })
})

describe('defaultLegText', () => {
  it('names the source of the default leg', () => {
    expect(defaultLegText([resolved([10, 12])])).toBe('6.0, from the procedure')
    expect(defaultLegText([resolved([12, 12], {}, null, 'fillet', 'WPS-GTAW')])).toBe('5.0, minimum for the plate')
    expect(defaultLegText([resolved([null, null], {}, null, 'fillet', 'WPS-GTAW')])).toBe('6.0, assumed, thickness unknown')
  })

  it('says the defaults differ when they do', () => {
    expect(defaultLegText([resolved([10, 12]), resolved([12, 12], {}, null, 'fillet', 'WPS-GTAW')])).toBe('Defaults differ')
  })
})

describe('legHints', () => {
  it('gives the minimum with its reason for one seam', () => {
    const hints = legHints([resolved([10, 12])])
    expect(hints[0]).toEqual({ level: 'info', text: 'Minimum 5 mm for the 12 mm plate (AWS D1.1).' })
  })

  it('gives the edge limit for a lap or corner joint', () => {
    const hints = legHints([resolved([8, 12], {}, null, 'lap')])
    expect(hints.map((h) => h.text)).toContain('At most 6.4 mm along the edge of the 8 mm plate.')
  })

  it('flags a leg under the minimum and over the edge limit as red', () => {
    const under = legHints([resolved([10, 12], {}, 4)])
    expect(under.find((h) => h.level === 'red')!.text).toBe('4.0 mm is below the 5 mm minimum.')
    const over = legHints([resolved([8, 12], {}, 7, 'lap')])
    expect(over.find((h) => h.level === 'red')!.text).toBe('7.0 mm is above the 6.4 mm the 8 mm plate edge allows.')
  })

  it('warns about more than one pass above 8 mm', () => {
    const hints = legHints([resolved([10, 12], {}, 9)])
    expect(hints.find((h) => h.level === 'amber')!.text).toBe('A leg above 8 mm usually needs more than one pass.')
  })

  it('says what to do when the thickness is unknown', () => {
    const hints = legHints([resolved([null, null])])
    expect(hints).toHaveLength(1)
    expect(hints[0]!.level).toBe('amber')
    expect(hints[0]!.text).toBe('The plate thickness is unknown, so the leg limits cannot be checked. Enter it under Geometry.')
  })

  it('gives a range of minimums for a selection', () => {
    const hints = legHints([resolved([10, 12]), resolved([14, 16])])
    expect(hints[0]!.text).toBe('Minimum 5 to 6 mm, by plate thickness (AWS D1.1).')
  })

  it('contains no dash characters', () => {
    const all = [resolved([5, 12], {}, 4, 'lap'), resolved([null, null]), resolved([10, 12], {}, 9)]
    for (const r of all) for (const h of legHints([r])) expect(h.text).not.toMatch(new RegExp('[\\u2013\\u2014]'))
  })
})
