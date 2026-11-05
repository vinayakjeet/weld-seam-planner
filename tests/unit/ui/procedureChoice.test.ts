import { describe, expect, it } from 'vitest'
import { WPS_PRESETS } from '../../../src/core/process/wps'
import { missingProcedureIds } from '../../../src/ui/panels/procedureChoice'

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
