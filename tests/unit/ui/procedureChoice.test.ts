import { describe, expect, it } from 'vitest'
import { WPS_PRESETS } from '../../../src/core/process/wps'
import { missingProcedureIds, procedureOptionLabel } from '../../../src/ui/panels/procedureChoice'

describe('missingProcedureIds', () => {
  const known = WPS_PRESETS[0]!.id

  it('is empty when every assigned id is in the library or nothing is assigned', () => {
    expect(missingProcedureIds([known, ''], WPS_PRESETS)).toEqual([])
    expect(missingProcedureIds([], WPS_PRESETS)).toEqual([])
  })

  it('lists an assigned id the library no longer has, once', () => {
    expect(missingProcedureIds(['GONE', known, 'GONE'], WPS_PRESETS)).toEqual(['GONE'])
  })
})

describe('procedureOptionLabel', () => {
  const spray = WPS_PRESETS.find((p) => p.id === 'WPS-GMAW-SPRAY-FW6')!

  it('marks an alternative that covers the seam position, so a better choice stands out in the open list', () => {
    expect(procedureOptionLabel(spray, 'PB', false)).toBe('GMAW spray, fillet 6 mm, PA/PB (matches PB)')
    expect(procedureOptionLabel(spray, 'PD', false)).toBe('GMAW spray, fillet 6 mm, PA/PB')
    expect(procedureOptionLabel(spray, null, false)).toBe('GMAW spray, fillet 6 mm, PA/PB')
  })

  it('shows the chosen procedure by its name alone, which is what the closed select has room for', () => {
    expect(procedureOptionLabel(spray, 'PB', true)).toBe('GMAW spray, fillet 6 mm, PA/PB')
  })
})
