import { describe, expect, it } from 'vitest'
import { procedureSchema, type Procedure } from '../../../src/core/job/schema'
import { heatInputCheck, heatInputKJmm, thermalEfficiency } from '../../../src/core/process/heatInput'
import {
  blankProcedure,
  duplicateProcedure,
  proceduresForPosition,
  resolveProcedure,
  WPS_PRESETS,
} from '../../../src/core/process/wps'

const spray = WPS_PRESETS.find((p) => p.id === 'WPS-GMAW-SPRAY-FW6')!

const SPEC_EXAMPLE = {
  id: 'WPS-GMAW-SPRAY-FW6',
  name: 'GMAW spray, fillet 6 mm, PA/PB',
  process: 'GMAW',
  transfer: 'spray',
  baseMaterial: { spec: 'S355', thicknessMm: [8, 20] },
  wire: { classification: 'ER70S-6', diameterMm: 1.2 },
  gas: { mix: 'Ar 82 / CO2 18', flowLpm: 15 },
  electrical: { currentA: 270, voltageV: 28, wireFeedMpm: 10, polarity: 'DCEP' },
  travelSpeedMmS: 9.0,
  ctwdMm: 18,
  torch: { workAngleOffsetDeg: 0, travelAngleDeg: 10, technique: 'push' },
  weave: { pattern: 'none', amplitudeMm: 0, frequencyHz: 0, dwellMs: 0 },
  arcStart: { preflowS: 0.3 },
  arcEnd: { craterFillS: 0.5, burnbackMs: 80, postflowS: 1.0 },
  positions: ['PA', 'PB'],
  thermalEfficiency: 0.8,
  preheatC: 20,
  interpassMaxC: 250,
}

describe('WPS_PRESETS', () => {
  it('has five presets with unique ids', () => {
    expect(WPS_PRESETS).toHaveLength(5)
    expect(new Set(WPS_PRESETS.map((p) => p.id)).size).toBe(5)
    expect(WPS_PRESETS.map((p) => p.id)).toEqual([
      'WPS-GMAW-SC',
      'WPS-GMAW-SPRAY-FW6',
      'WPS-GMAW-PULSE',
      'WPS-FCAW-G',
      'WPS-GTAW',
    ])
  })

  it('parses every preset with procedureSchema', () => {
    for (const p of WPS_PRESETS) {
      const r = procedureSchema.safeParse(p)
      expect(r.success, p.id).toBe(true)
    }
  })

  it('makes the spray preset equal the spec example procedure', () => {
    expect(spray).toEqual(SPEC_EXAMPLE)
  })

  it('takes thermalEfficiency from the process', () => {
    for (const p of WPS_PRESETS) expect(p.thermalEfficiency, p.id).toBe(thermalEfficiency(p.process))
  })

  it('has an ok heat input in the middle of each thickness range', () => {
    for (const p of WPS_PRESETS) {
      const [lo, hi] = p.baseMaterial.thicknessMm
      const q = heatInputKJmm(p.thermalEfficiency, p.electrical.voltageV, p.electrical.currentA, p.travelSpeedMmS * 60)
      expect(heatInputCheck(q, (lo + hi) / 2).level, p.id).toBe('ok')
    }
  })

  it('has no wire feed on the GTAW preset and DCEN polarity', () => {
    const g = WPS_PRESETS.find((p) => p.id === 'WPS-GTAW')!
    expect(g.electrical.wireFeedMpm).toBeUndefined()
    expect(g.electrical.polarity).toBe('DCEN')
    expect(g.ctwdMm).toBeNull()
    expect(g.interpassMaxC).toBe(150)
  })
})

describe('resolveProcedure', () => {
  it('merges nested overrides and keeps other nested values', () => {
    const r = resolveProcedure(spray, { electrical: { currentA: 250 } })
    expect(r.electrical.currentA).toBe(250)
    expect(r.electrical.voltageV).toBe(28)
    expect(spray.electrical.currentA).toBe(270)
  })

  it('does not mutate the overrides', () => {
    const o = { electrical: { currentA: 250 } }
    resolveProcedure(spray, o)
    expect(o).toEqual({ electrical: { currentA: 250 } })
  })

  it('leaves the id and name unchanged', () => {
    const r = resolveProcedure(spray, { id: 'x', name: 'y' } as never)
    expect(r.id).toBe(spray.id)
    expect(r.name).toBe(spray.name)
  })

  it('ignores undefined override values', () => {
    expect(resolveProcedure(spray, { travelSpeedMmS: undefined }).travelSpeedMmS).toBe(9)
  })

  it('returns a copy even for empty overrides', () => {
    const r = resolveProcedure(spray, {})
    expect(r).toEqual(spray)
    expect(r.electrical).not.toBe(spray.electrical)
  })
})

describe('duplicateProcedure and blankProcedure', () => {
  it('appends -COPY, then -COPY-2 when taken, and (copy) to the name', () => {
    const first = duplicateProcedure(spray, [spray.id])
    expect(first.id).toBe('WPS-GMAW-SPRAY-FW6-COPY')
    expect(first.name.endsWith(' (copy)')).toBe(true)
    expect(duplicateProcedure(spray, [spray.id, first.id]).id).toBe('WPS-GMAW-SPRAY-FW6-COPY-2')
    expect(first.electrical).toEqual(spray.electrical)
    expect(first.electrical).not.toBe(spray.electrical)
  })

  it('gives a valid blank procedure with a free id', () => {
    const b = blankProcedure(['WPS-NEW'])
    expect(b.id).not.toBe('WPS-NEW')
    expect(procedureSchema.safeParse(b).success).toBe(true)
  })
})

describe('proceduresForPosition', () => {
  it('lists matching procedures first, then the rest, each in library order', () => {
    expect(proceduresForPosition(WPS_PRESETS, 'PD').map((p) => p.id)).toEqual([
      'WPS-GMAW-SC',
      'WPS-GMAW-PULSE',
      'WPS-GMAW-SPRAY-FW6',
      'WPS-FCAW-G',
      'WPS-GTAW',
    ])
  })

  it('keeps library order for a null position', () => {
    expect(proceduresForPosition(WPS_PRESETS, null).map((p) => p.id)).toEqual(WPS_PRESETS.map((p) => p.id))
  })

  it('does not mutate the library', () => {
    const copy: Procedure[] = [...WPS_PRESETS]
    proceduresForPosition(copy, 'PD')
    expect(copy.map((p) => p.id)).toEqual(WPS_PRESETS.map((p) => p.id))
  })
})
