import { describe, expect, it } from 'vitest'
import { pointerClaimed } from '../../../src/ui/viewport/pickGuard'

describe('pointerClaimed', () => {
  it('is true for the draw and split tools', () => {
    expect(pointerClaimed({ tool: { tool: 'draw' }, placingPort: false })).toBe(true)
    expect(pointerClaimed({ tool: { tool: 'split' }, placingPort: false })).toBe(true)
  })

  it('is true for any tool while a port is being placed', () => {
    expect(pointerClaimed({ tool: { tool: 'select' }, placingPort: true })).toBe(true)
    expect(pointerClaimed({ tool: { tool: 'merge' }, placingPort: true })).toBe(true)
  })

  it('is false for select and merge when no port is being placed', () => {
    expect(pointerClaimed({ tool: { tool: 'select' }, placingPort: false })).toBe(false)
    expect(pointerClaimed({ tool: { tool: 'merge' }, placingPort: false })).toBe(false)
  })
})
