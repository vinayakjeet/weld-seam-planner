import { describe, expect, it } from 'vitest'
import { STEPS } from '../../../src/state/store'
import { firstRunHint } from '../../../src/ui/shell/firstRunHint'

describe('firstRunHint', () => {
  it('lists the six steps by their stepper names', () => {
    expect(firstRunHint(STEPS)).toBe('Six steps: Import, Seams, Procedures, Access, Sequence, Export.')
  })

  it('counts the steps it is given', () => {
    expect(firstRunHint([{ label: 'A' }, { label: 'B' }, { label: 'C' }])).toBe('Three steps: A, B, C.')
  })
})
