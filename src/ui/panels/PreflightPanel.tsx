import { useMemo, useState } from 'react'
import { selectAllSeams, selectPlan } from '../../state/selectors'
import { useStore } from '../../state/store'
import { groupIssues, type Row } from './preflightGroups'

// The 10 px code and the count badge use the chip colours, which stay readable on a selected row.
const TONE = { error: 'text-chip-err', warning: 'text-chip-warn', info: 'text-chip-info' } as const

type Severity = keyof typeof TONE

function IssueRow({ row, severity, open, onToggle }: { row: Row; severity: Severity; open: boolean; onToggle: () => void }) {
  const select = useStore((s) => s.select)
  const selected = useStore((s) => row.issue.seamId !== null && s.selectedId === row.issue.seamId)
  const { issue } = row
  return (
    <li className={`border-b border-line/50 ${selected ? 'bg-brand/20' : ''}`}>
      <button
        type="button"
        aria-expanded={open}
        data-issue-code={issue.code}
        onClick={() => {
          if (issue.seamId !== null) select(issue.seamId)
          onToggle()
        }}
        className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)] items-baseline gap-x-2 px-3 py-1.5 text-left outline-none hover:bg-surface-2 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand"
      >
        <span className="truncate font-medium text-ink-0">{row.label}</span>
        {/* The code sits above the sentence, so the sentence has the width of the panel instead of a narrow column. */}
        <span className="min-w-0">
          <span className={`num block text-[10px] ${TONE[severity]}`}>{issue.code}</span>
          <span className="block text-ink-1">{issue.what}</span>
        </span>
      </button>
      {open && (
        <div className="space-y-1 px-3 pb-2 pl-[3.75rem] text-ink-1">
          <p>{issue.why}</p>
          <p className="text-ink-0">{issue.next}</p>
        </div>
      )}
    </li>
  )
}

function Group({ title, severity, rows, open, toggle }: { title: string; severity: Severity; rows: Row[]; open: Set<string>; toggle: (key: string) => void }) {
  return (
    <section aria-label={title}>
      <h3 className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2">
        <span>{title}</span>
        <span className={`num rounded-full border border-line px-1.5 ${rows.length > 0 ? TONE[severity] : ''}`}>{rows.length}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="px-3 py-2 text-ink-2">None.</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <IssueRow key={row.key} row={row} severity={severity} open={open.has(row.key)} onToggle={() => toggle(row.key)} />
          ))}
        </ul>
      )}
    </section>
  )
}

// Step 5: what pre-flight found, errors first. Clicking a row selects its seam and shows why and what to do.
export function PreflightPanel() {
  const hasPart = useStore((s) => s.part !== null)
  const current = useStore((s) => s.issuesFor === selectPlan(s))
  const issues = useStore((s) => s.issues)
  const seams = useStore((s) => s.seams)
  const manualSeams = useStore((s) => s.manualSeams)
  const supersededIds = useStore((s) => s.supersededIds)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const grouped = useMemo(() => {
    const labels = new Map(selectAllSeams({ seams, manualSeams, supersededIds }).map((seam) => [seam.id, seam.label]))
    return groupIssues(issues, (id) => labels.get(id) ?? id)
  }, [issues, seams, manualSeams, supersededIds])
  const toggle = (key: string) =>
    setOpen((previous) => {
      const next = new Set(previous)
      if (!next.delete(key)) next.add(key)
      return next
    })

  // The message above the panel already says that a part is needed first.
  if (!hasPart) return <div className="flex-1" />
  return (
    <div aria-label="Pre-flight" className="min-h-0 flex-1 overflow-y-auto">
      {!current ? (
        <p role="status" className="border-b border-line px-3 py-2 text-ink-2">
          Checking
        </p>
      ) : grouped.errors.length === 0 ? (
        <p role="status" className="border-b border-line px-3 py-2 text-ok">
          No errors. Export is ready.
        </p>
      ) : null}
      <Group title="Errors" severity="error" rows={grouped.errors} open={open} toggle={toggle} />
      <Group title="Warnings" severity="warning" rows={grouped.warnings} open={open} toggle={toggle} />
      {grouped.info.length > 0 && <Group title="Notes" severity="info" rows={grouped.info} open={open} toggle={toggle} />}
    </div>
  )
}
