import { describe, expect, it } from 'vitest'
import type { Issue } from '../../../src/core/job/preflight'
import { groupIssues } from '../../../src/ui/panels/preflightGroups'

const issue = (code: Issue['code'], severity: Issue['severity'], seamId: string | null): Issue => ({
  code,
  severity,
  seamId,
  what: `${code} what`,
  why: `${code} why`,
  next: `${code} next`,
})

describe('groupIssues', () => {
  const issues = [
    issue('SHORT_SEAM', 'warning', 's1'),
    issue('NO_PROCEDURE', 'error', 's2'),
    issue('NO_SEAMS', 'error', null),
    issue('MULTI_PASS', 'warning', 's2'),
  ]
  const grouped = groupIssues(issues, (id) => id.toUpperCase())

  it('splits by severity and keeps the order within each group', () => {
    expect(grouped.errors.map((r) => r.issue.code)).toEqual(['NO_PROCEDURE', 'NO_SEAMS'])
    expect(grouped.warnings.map((r) => r.issue.code)).toEqual(['SHORT_SEAM', 'MULTI_PASS'])
  })

  it('labels a seam issue with the seam label and a plan issue "Plan"', () => {
    expect(grouped.errors.map((r) => r.label)).toEqual(['S2', 'Plan'])
    expect(grouped.warnings.map((r) => r.label)).toEqual(['S1', 'S2'])
  })

  it('gives every row a distinct key, even for the same code on the same seam', () => {
    const twice = groupIssues([issue('OVERLAP', 'error', 'a'), issue('OVERLAP', 'error', 'a')], (id) => id)
    expect(new Set(twice.errors.map((r) => r.key)).size).toBe(2)
  })

  it('returns empty groups for no issues', () => {
    expect(groupIssues([], (id) => id)).toEqual({ errors: [], warnings: [] })
  })
})
