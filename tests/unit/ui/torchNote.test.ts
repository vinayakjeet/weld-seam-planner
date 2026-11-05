import { describe, expect, it } from 'vitest'
import { torchNote } from '../../../src/ui/panels/torchNote'

const DASHES = new RegExp('[\\u2013\\u2014]')

describe('torchNote', () => {
  it('says the torch is drawn to scale when the scale is about 1, and names the procedure distance', () => {
    expect(torchNote(1, 18)).toBe('The torch is drawn to scale. The contact tip distance, 18 mm, comes from the procedure.')
    expect(torchNote(1.03, 18)).toMatch(/to scale/)
  })

  it('says how much bigger the torch is drawn than it is, and that the distance is scaled with it', () => {
    expect(torchNote(2.667, 12)).toBe('The torch is drawn 2.7 times its real size so that it shows on this part. The contact tip distance, 12 mm, comes from the procedure and is scaled the same.')
  })

  it('says how much smaller it is drawn', () => {
    expect(torchNote(0.5, 16)).toMatch(/0\.5 times its real size so that it fits this part/)
  })

  it('names the default when the procedure has no contact tip distance or there is none', () => {
    expect(torchNote(1, null)).toBe('The torch is drawn to scale. The procedure has no contact tip distance, so 15 mm is drawn.')
    expect(torchNote(1, undefined)).toMatch(/15 mm is drawn/)
  })

  it('writes a distance with a fraction without trailing zeros', () => {
    expect(torchNote(1, 12.5)).toMatch(/12\.5 mm/)
    expect(torchNote(1, 12.0)).toMatch(/ 12 mm/)
  })

  it('uses no dash characters and no emoji', () => {
    for (const note of [torchNote(1, 18), torchNote(3, null), torchNote(0.3, 12)]) {
      expect(note).not.toMatch(DASHES)
      expect(note).not.toMatch(/\p{Extended_Pictographic}/u)
    }
  })
})
