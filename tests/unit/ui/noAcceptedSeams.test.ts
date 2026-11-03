import { describe, expect, it } from 'vitest'
import { NO_ACCEPTED_TEXT, showsNoAccepted } from '../../../src/ui/panels/NoAcceptedSeams'

describe('showsNoAccepted', () => {
  it('is true in the procedures, sequence and export steps when nothing is accepted', () => {
    expect(showsNoAccepted('procedures', 0)).toBe(true)
    expect(showsNoAccepted('sequence', 0)).toBe(true)
    expect(showsNoAccepted('export', 0)).toBe(true)
  })

  it('is false once a seam is accepted', () => {
    expect(showsNoAccepted('procedures', 1)).toBe(false)
    expect(showsNoAccepted('sequence', 12)).toBe(false)
    expect(showsNoAccepted('export', 1)).toBe(false)
  })

  it('is false in the import and seams steps, where accepting happens', () => {
    expect(showsNoAccepted('import', 0)).toBe(false)
    expect(showsNoAccepted('seams', 0)).toBe(false)
  })

  it('says what happened and what to do', () => {
    expect(NO_ACCEPTED_TEXT).toBe('No accepted seams. Accept seams in step 2 first.')
  })
})
