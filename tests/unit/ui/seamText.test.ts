import { describe, expect, it } from 'vitest'
import { acceptAllLabel, hiddenAcceptedMessage } from '../../../src/ui/panels/seamText'

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
