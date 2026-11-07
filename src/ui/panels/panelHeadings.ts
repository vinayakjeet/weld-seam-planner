import type { StepId } from '../../state/store'

// The one heading at the top of the left panel for each step. Import and Seams share the seam list.
export const STEP_PANEL_HEADING: Record<StepId, string> = {
  import: 'Seam candidates',
  seams: 'Seam candidates',
  procedures: 'Procedure library',
  access: 'Ports',
  sequence: 'Sequence',
  export: 'Pre-flight',
}

// Sequence and Export put their own lists in place of the seam table, so the chips that filter it are left out there.
export const showsSeamTable = (step: StepId): boolean => step !== 'sequence' && step !== 'export'
