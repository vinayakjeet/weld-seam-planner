import { describe, expect, it } from 'vitest'
import { DEFAULT_ARM } from '../../../src/core/snake/arm'
import { ARM_FIELDS } from '../../../src/ui/panels/armFields'

describe('ARM_FIELDS', () => {
  it('has one field for every arm parameter, so none is exported without a way to edit it', () => {
    expect(ARM_FIELDS.map((f) => f.key).sort()).toEqual(Object.keys(DEFAULT_ARM).sort())
  })

  it('labels insertion depth and clearance in mm', () => {
    const byKey = Object.fromEntries(ARM_FIELDS.map((f) => [f.key, f]))
    expect(byKey.insertionMm).toMatchObject({ label: 'Insertion depth', unit: 'mm' })
    expect(byKey.clearanceMm).toMatchObject({ label: 'Clearance', unit: 'mm' })
  })
})
