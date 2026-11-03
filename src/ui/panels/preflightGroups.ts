import type { Issue } from '../../core/job/preflight'

export interface Row {
  // Unique within one list: the same code can fire twice on a seam.
  key: string
  label: string
  issue: Issue
}

export interface GroupedIssues {
  errors: Row[]
  warnings: Row[]
  info: Row[]
}

export function groupIssues(issues: Issue[], labelOf: (seamId: string) => string): GroupedIssues {
  const grouped: GroupedIssues = { errors: [], warnings: [], info: [] }
  issues.forEach((issue, index) => {
    const row: Row = { key: `${index}:${issue.code}:${issue.seamId ?? ''}`, label: issue.seamId === null ? 'Plan' : labelOf(issue.seamId), issue }
    grouped[issue.severity === 'error' ? 'errors' : issue.severity === 'warning' ? 'warnings' : 'info'].push(row)
  })
  return grouped
}
