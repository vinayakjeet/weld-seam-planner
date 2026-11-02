import type { MeshWarning } from '../../core/mesh/health'

export interface WarningChip {
  code: MeshWarning['code']
  label: string
  severity: MeshWarning['severity']
  // Three lines: what happened, why, what to do next.
  detail: string
}

const LABELS: Record<MeshWarning['code'], string> = {
  'open-mesh': 'Open mesh',
  'non-manifold': 'Non-manifold edges',
  reoriented: 'Winding repaired',
  'concavity-unknown': 'Concavity unknown',
}

export function warningChips(warnings: MeshWarning[]): WarningChip[] {
  return warnings.map((w) => ({
    code: w.code,
    label: LABELS[w.code],
    severity: w.severity,
    detail: [w.what, w.why, w.next].join('\n'),
  }))
}
