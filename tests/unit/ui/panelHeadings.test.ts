import { expect, it } from 'vitest'
import { STEPS } from '../../../src/state/store'
import { showsSeamTable, STEP_PANEL_HEADING } from '../../../src/ui/panels/panelHeadings'

it('gives every step a heading for the top of the left panel', () => {
  for (const step of STEPS) expect(STEP_PANEL_HEADING[step.id].length, step.id).toBeGreaterThan(0)
})

it('keeps the names the panels already used', () => {
  expect(STEP_PANEL_HEADING.procedures).toBe('Procedure library')
  expect(STEP_PANEL_HEADING.access).toBe('Ports')
})

it('shows the seam table, and the chips that filter it, only in the steps that list the seams', () => {
  expect(STEPS.filter((step) => showsSeamTable(step.id)).map((step) => step.id)).toEqual(['import', 'seams', 'procedures', 'access'])
})
