import { describe, expect, it } from 'vitest'
import { nextPortId, portRows } from '../../../src/ui/panels/portRows'

describe('portRows', () => {
  it('writes a straight down port as 0, 0, -1', () => {
    expect(portRows([{ id: 'P1', position: [1200, 500.25, 1000], direction: [0, 0, -1], diameterMm: 600 }])).toEqual([
      { id: 'P1', position: '1200, 500.3, 1000', direction: '0, 0, -1', diameter: '600' },
    ])
  })

  it('trims an oblique direction to 3 decimals and drops a negative zero', () => {
    const [row] = portRows([{ id: 'P2', position: [0, 0, 0], direction: [-0.00001, 0.70710678, -0.70710678], diameterMm: 250.5 }])
    expect(row!.direction).toBe('0, 0.707, -0.707')
    expect(row!.diameter).toBe('250.5')
  })
})

describe('nextPortId', () => {
  it('is P1 when there is no port', () => {
    expect(nextPortId([])).toBe('P1')
  })

  it('is one more than the highest number in use', () => {
    const port = (id: string) => ({ id, position: [0, 0, 0] as [number, number, number], direction: [0, 0, -1] as [number, number, number], diameterMm: 600 })
    expect(nextPortId([port('P1'), port('P4')])).toBe('P5')
    expect(nextPortId([port('north')])).toBe('P1')
  })
})
