import { describe, expect, it } from 'vitest'
import { acceptAllLabel, hiddenAcceptedMessage, noSeamsMessage } from '../../../src/ui/panels/seamText'

describe('acceptAllLabel', () => {
  it('shows the threshold with two decimals', () => {
    expect(acceptAllLabel(0.7)).toBe('Accept all above 0.70')
    expect(acceptAllLabel(0)).toBe('Accept all above 0.00')
    expect(acceptAllLabel(1)).toBe('Accept all above 1.00')
  })

  it('is not thrown off by floating point steps of the slider', () => {
    expect(acceptAllLabel(0.15000000000000002)).toBe('Accept all above 0.15')
    expect(acceptAllLabel(0.35 + 0.05)).toBe('Accept all above 0.40')
  })
})

describe('hiddenAcceptedMessage', () => {
  it('says nothing when no accepted seam is hidden', () => {
    expect(hiddenAcceptedMessage(0)).toBeNull()
  })

  it('names the count and says the seams return', () => {
    expect(hiddenAcceptedMessage(3)).toBe('3 accepted seams are hidden at this angle and return if you move the slider back.')
  })

  it('uses the singular for one seam', () => {
    expect(hiddenAcceptedMessage(1)).toBe('1 accepted seam is hidden at this angle and returns if you move the slider back.')
  })
})

describe('noSeamsMessage', () => {
  it('says what to try when nothing at all was found', () => {
    const text = noSeamsMessage(0)
    expect(text).toMatch(/^No seams found/)
    expect(text).toContain('Lower it in the Detection tab')
  })

  it('points to the corner switch when corner candidates are hidden, in singular and plural', () => {
    expect(noSeamsMessage(1)).toContain('1 corner candidate is hidden')
    expect(noSeamsMessage(12)).toContain('12 corner candidates are hidden')
    expect(noSeamsMessage(12)).toContain('Show corner candidates')
  })

  it('points to the hollow switch when seams inside hollow sections are hidden, in singular and plural', () => {
    expect(noSeamsMessage(0, 1)).toContain('1 seam inside a hollow section is hidden')
    expect(noSeamsMessage(0, 4)).toContain('4 seams inside hollow sections are hidden')
    expect(noSeamsMessage(0, 4)).toContain('Show seams inside hollow sections')
    expect(noSeamsMessage(0, 4)).not.toContain('corner')
  })

  it('names both switches when both kinds are hidden', () => {
    const text = noSeamsMessage(1, 4)
    expect(text).toContain('1 corner candidate and 4 seams inside hollow sections are hidden')
    expect(text).toContain('Show corner candidates or Show seams inside hollow sections')
  })

  it('never uses an en or em dash', () => {
    for (const n of [0, 1, 5]) for (const h of [0, 1, 5]) expect(noSeamsMessage(n, h)).not.toMatch(/[\u2013\u2014]/)
  })
})
