import { describe, expect, it } from 'vitest'
import { selectPartWarnings } from '../../../src/state/selectors'
import { warningChips } from '../../../src/ui/panels/partWarnings'
import { partInfo } from '../helpers/state'

describe('selectPartWarnings', () => {
  it('is empty without a part and for a clean part', () => {
    expect(selectPartWarnings({ part: null })).toEqual([])
    expect(selectPartWarnings({ part: partInfo() })).toEqual([])
  })

  it('reads the counts from the part info', () => {
    const warnings = selectPartWarnings({ part: partInfo({ boundaryEdges: 4, nonManifoldEdges: 2 }) })
    expect(warnings.map((w) => w.code)).toEqual(['open-mesh', 'non-manifold'])
  })
})

describe('warningChips', () => {
  it('gives each warning a short label, a severity and a tooltip with what, why and next', () => {
    const chips = warningChips(
      selectPartWarnings({ part: partInfo({ boundaryEdges: 4, nonManifoldEdges: 2, reorientedBodies: 1, unsignedBodies: 1 }) }),
    )
    expect(chips.map((c) => c.label)).toEqual(['Open mesh', 'Non-manifold edges', 'Winding repaired', 'Concavity unknown'])
    expect(chips.map((c) => c.severity)).toEqual(['warn', 'warn', 'info', 'warn'])
    for (const chip of chips) {
      expect(chip.detail.split('\n')).toHaveLength(3)
      expect(chip.detail).not.toMatch(/[\u2013\u2014]/)
    }
  })

  it('shows no chips for a clean part', () => {
    expect(warningChips([])).toEqual([])
  })
})
