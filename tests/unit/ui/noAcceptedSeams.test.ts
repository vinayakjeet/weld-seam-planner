import { describe, expect, it } from 'vitest'
import { firstNeed, NO_ACCEPTED_TEXT, NO_PART_TEXT, showsNoAccepted } from '../../../src/ui/panels/NoAcceptedSeams'

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

describe('firstNeed', () => {
  it('sends the user to step 1 while no part is loaded, since accepting seams needs a part', () => {
    expect(firstNeed(false)).toEqual({ text: NO_PART_TEXT, step: 'import', action: 'Go to Import' })
    expect(NO_PART_TEXT).toBe('No part loaded. Pick a sample or drop an STL file in step 1 first.')
  })

  it('sends the user to step 2 once a part is loaded', () => {
    expect(firstNeed(true)).toEqual({ text: NO_ACCEPTED_TEXT, step: 'seams', action: 'Go to Seams' })
  })
})
