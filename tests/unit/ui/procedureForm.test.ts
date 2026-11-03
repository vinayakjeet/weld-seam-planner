import { describe, expect, it } from 'vitest'
import { WPS_PRESETS } from '../../../src/core/process/wps'
import { FORM_FIELDS, fromForm, libraryLine, toForm } from '../../../src/ui/panels/procedureForm'

const spray = WPS_PRESETS.find((p) => p.id === 'WPS-GMAW-SPRAY-FW6')!

function failed(result: ReturnType<typeof fromForm>) {
  if (result.ok) throw new Error('expected the form to be refused')
  return result.errors
}

describe('procedure to form and back', () => {
  for (const preset of WPS_PRESETS) {
    it(`is the identity for ${preset.id}`, () => {
      const result = fromForm(toForm(preset), preset)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.procedure).toEqual(preset)
    })
  }

  it('shows numbers as plain strings and leaves optional values empty', () => {
    const form = toForm(WPS_PRESETS.find((p) => p.id === 'WPS-GTAW')!)
    expect(form.current).toBe('115')
    expect(form.wireFeed).toBe('')
    expect(form.ctwd).toBe('')
    expect(form.transfer).toBe('')
    expect(toForm(spray).positions).toEqual(['PA', 'PB'])
  })

  it('keeps fields the form does not edit', () => {
    const base = { ...spray, notes: 'from the cell' } as typeof spray
    const result = fromForm(toForm(base), base)
    expect(result.ok && (result.procedure as Record<string, unknown>).notes).toBe('from the cell')
  })

  it('writes an emptied optional field as absent, or null for the contact tip distance', () => {
    const form = { ...toForm(spray), wireFeed: '', ctwd: '', transfer: '' }
    const result = fromForm(form, spray)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.procedure.electrical.wireFeedMpm).toBeUndefined()
    expect(result.procedure.ctwdMm).toBeNull()
    expect(result.procedure.transfer).toBeUndefined()
  })
})

describe('form errors', () => {
  it('refuses travel speed 0 with the sentence, a reason and a next step', () => {
    const errors = failed(fromForm({ ...toForm(spray), travel: '0' }, spray))
    expect(errors.travel!.what).toBe('Travel speed must be above 0 mm/s.')
    expect(errors.travel!.why.length).toBeGreaterThan(0)
    expect(errors.travel!.next.length).toBeGreaterThan(0)
    expect(Object.keys(errors)).toEqual(['travel'])
  })

  it('refuses text that is not a number, naming the field', () => {
    const errors = failed(fromForm({ ...toForm(spray), current: 'abc' }, spray))
    expect(errors.current!.what).toBe('Current must be a number.')
  })

  it('refuses an empty required field and a name of spaces', () => {
    const errors = failed(fromForm({ ...toForm(spray), voltage: '', name: '   ' }, spray))
    expect(errors.voltage!.what).toBe('Voltage is required.')
    expect(errors.name!.what).toBe('Name is required.')
  })

  it('refuses a negative value where only zero or more is allowed', () => {
    const errors = failed(fromForm({ ...toForm(spray), preflow: '-1' }, spray))
    expect(errors.preflow!.what).toBe('Pre-flow cannot be below 0 s.')
  })

  it('refuses a thermal efficiency above 1', () => {
    const errors = failed(fromForm({ ...toForm(spray), efficiency: '1.5' }, spray))
    expect(errors.efficiency!.what).toBe('Thermal efficiency must be above 0 and at most 1.')
  })

  it('refuses a thickness range that runs backwards, on the upper field', () => {
    const errors = failed(fromForm({ ...toForm(spray), thicknessLo: '20', thicknessHi: '8' }, spray))
    expect(errors.thicknessHi!.what).toContain('smaller to the larger')
  })

  it('refuses no positions', () => {
    const errors = failed(fromForm({ ...toForm(spray), positions: [] }, spray))
    expect(errors.positions!.what).toBe('Choose at least one welding position.')
  })

  it('refuses an id that another procedure has, but not the procedure own id', () => {
    const taken = ['WPS-GTAW', spray.id]
    const errors = failed(fromForm({ ...toForm(spray), id: 'WPS-GTAW' }, spray, taken))
    expect(errors.id!.what).toBe('The id WPS-GTAW is already used by another procedure.')
    expect(fromForm(toForm(spray), spray, taken, spray.id).ok).toBe(true)
  })

  it('half a gas entry is refused on the missing half', () => {
    const errors = failed(fromForm({ ...toForm(spray), gasFlow: '' }, spray))
    expect(errors.gasFlow!.what).toBe('Gas flow is required when a gas mix is set.')
  })

  it('every message is free of dash characters', () => {
    const errors = failed(fromForm({ ...toForm(spray), travel: '0', current: 'x', name: '', positions: [] }, spray))
    for (const e of Object.values(errors)) expect(`${e.what}${e.why}${e.next}`).not.toMatch(new RegExp('[\\u2013\\u2014]'))
  })

  it('has a field definition for every form string', () => {
    const keys = Object.keys(toForm(spray)).filter((k) => k !== 'positions').sort()
    expect(FORM_FIELDS.map((f) => f.key).sort()).toEqual(keys)
  })
})

describe('libraryLine', () => {
  it('names the process, transfer, positions and the number of seams', () => {
    expect(libraryLine(spray, 3)).toBe('GMAW spray, PA PB, used by 3 seams')
    expect(libraryLine(spray, 1)).toBe('GMAW spray, PA PB, used by 1 seam')
    expect(libraryLine(spray, 0)).toBe('GMAW spray, PA PB, not used')
    expect(libraryLine(WPS_PRESETS.find((p) => p.id === 'WPS-GTAW')!, 0)).toBe('GTAW, PA PB PF, not used')
  })
})
