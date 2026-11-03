import { describe, expect, it } from 'vitest'
import { ISO_POSITIONS, procedureOverridesSchema, procedureSchema } from '../../../src/core/job/schema'
import { WPS_PRESETS } from '../../../src/core/process/wps'

const spray = WPS_PRESETS.find((p) => p.id === 'WPS-GMAW-SPRAY-FW6')!

function pathsOf(input: unknown): string[] {
  const r = procedureSchema.safeParse(input)
  expect(r.success).toBe(false)
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
}

describe('procedureSchema', () => {
  it('lists positions PA to PG', () => {
    expect([...ISO_POSITIONS]).toEqual(['PA', 'PB', 'PC', 'PD', 'PE', 'PF', 'PG'])
  })

  it('accepts a preset', () => {
    expect(procedureSchema.safeParse(spray).success).toBe(true)
  })

  it('rejects travel speed 0 with the field path', () => {
    expect(pathsOf({ ...spray, travelSpeedMmS: 0 })).toContain('travelSpeedMmS')
  })

  it('rejects voltage 0 with the nested field path', () => {
    expect(pathsOf({ ...spray, electrical: { ...spray.electrical, voltageV: 0 } })).toContain('electrical.voltageV')
  })

  it('rejects an empty name', () => {
    expect(pathsOf({ ...spray, name: '' })).toContain('name')
  })

  it('rejects empty positions and unknown position codes', () => {
    expect(pathsOf({ ...spray, positions: [] })).toContain('positions')
    expect(pathsOf({ ...spray, positions: ['PX'] }).some((p) => p.startsWith('positions'))).toBe(true)
  })

  it('rejects a thermal efficiency outside (0, 1]', () => {
    expect(pathsOf({ ...spray, thermalEfficiency: 0 })).toContain('thermalEfficiency')
    expect(pathsOf({ ...spray, thermalEfficiency: 1.2 })).toContain('thermalEfficiency')
  })

  it('rejects a reversed thickness range', () => {
    expect(pathsOf({ ...spray, baseMaterial: { spec: 'S355', thicknessMm: [20, 8] } }).some((p) => p.startsWith('baseMaterial'))).toBe(true)
  })

  it('lets unknown fields through for forward compatibility', () => {
    expect(procedureSchema.safeParse({ ...spray, futureField: 1 }).success).toBe(true)
  })

  it('carries descriptions from the spec on the top level fields', () => {
    const meta = procedureSchema.shape.process.meta()
    expect(meta?.description).toBeTruthy()
  })
})

describe('procedureOverridesSchema', () => {
  it('accepts an empty object and partial nested objects', () => {
    expect(procedureOverridesSchema.safeParse({}).success).toBe(true)
    expect(procedureOverridesSchema.safeParse({ electrical: { currentA: 250 } }).success).toBe(true)
    expect(procedureOverridesSchema.safeParse({ torch: { travelAngleDeg: 15 } }).success).toBe(true)
  })

  it('still rejects invalid values', () => {
    const r = procedureOverridesSchema.safeParse({ electrical: { currentA: -1 } })
    expect(r.success).toBe(false)
    expect(r.success ? '' : r.error.issues[0]!.path.join('.')).toBe('electrical.currentA')
  })
})
