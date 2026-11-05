import { describe, expect, it } from 'vitest'
import { armTorch } from '../../../src/ui/viewport/armTorch'

describe('armTorch', () => {
  it('runs from the wrist along the last link for the torch length', () => {
    expect(armTorch([[0, 0, 0], [0, 0, -100], [0, 30, -140]], 250)).toEqual({ from: [0, 30, -140], to: [0, 30 + 0.6 * 250, -140 - 0.8 * 250] })
  })

  it('has no torch without a link or with a zero length last link', () => {
    expect(armTorch([[0, 0, 0]], 250)).toBeNull()
    expect(armTorch([[0, 0, 0], [1, 2, 3], [1, 2, 3]], 250)).toBeNull()
    expect(armTorch([], 250)).toBeNull()
  })
})
