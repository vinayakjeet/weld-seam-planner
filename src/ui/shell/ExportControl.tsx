import * as Menu from '@radix-ui/react-dropdown-menu'
import { useRef } from 'react'
import { copySummary, exportPlan, importPlan } from '../../state/flows'
import { selectPlan } from '../../state/selectors'
import { useStore } from '../../state/store'
import { getGeometryClient } from '../../worker/client'
import { Tooltip } from '../kit/Tooltip'

const ITEM = 'cursor-pointer rounded-sm px-2 py-1 outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[highlighted]:bg-brand/20'

function useExportState() {
  const hasPart = useStore((s) => s.part !== null)
  const current = useStore((s) => s.issuesFor === selectPlan(s))
  const errors = useStore((s) => s.issues.reduce((n, issue) => n + (issue.severity === 'error' ? 1 : 0), 0))
  return { hasPart, checking: !current, errors, canExport: hasPart && current && errors === 0 }
}

function whyDisabled({ hasPart, checking, errors }: ReturnType<typeof useExportState>): string {
  if (!hasPart) return 'Export unlocks after a part is loaded and its seams pass pre-flight.'
  if (checking) return 'Checking the plan before export.'
  return `Export is blocked by ${errors} ${errors === 1 ? 'error' : 'errors'}. Open Validate and Export to see them.`
}

// Export is a split button: the main part downloads the job, the chevron holds the actions that stay available with errors.
export function ExportControl() {
  const status = useExportState()
  const input = useRef<HTMLInputElement>(null)
  const client = getGeometryClient()
  const main = (
    <button
      type="button"
      disabled={!status.canExport}
      onClick={() => void exportPlan(client)}
      className="h-8 rounded-l-sm bg-brand px-4 font-medium text-white outline-none hover:brightness-110 focus-visible:ring-1 focus-visible:ring-ink-0 disabled:cursor-not-allowed disabled:opacity-40"
    >
      Export
    </button>
  )
  return (
    <div className="flex items-center">
      {status.canExport ? (
        main
      ) : (
        <Tooltip content={whyDisabled(status)}>
          <span tabIndex={0} className="rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-brand">
            {main}
          </span>
        </Tooltip>
      )}
      <Menu.Root>
        <Menu.Trigger asChild>
          <button
            type="button"
            aria-label="More export options"
            className="grid h-8 w-7 place-items-center rounded-r-sm border-l border-white/30 bg-brand text-white outline-none hover:brightness-110 focus-visible:ring-1 focus-visible:ring-ink-0"
          >
            <svg aria-hidden width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 1l4 4 4-4" />
            </svg>
          </button>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-sm border border-line bg-surface-2 p-1 text-xs text-ink-0 shadow-lg">
            <Menu.Item disabled={!status.canExport} onSelect={() => void exportPlan(client)} className={ITEM}>
              Export JSON
            </Menu.Item>
            <Menu.Item disabled={!status.hasPart} onSelect={() => input.current?.click()} className={ITEM}>
              Import plan
            </Menu.Item>
            <Menu.Item disabled={!status.hasPart} onSelect={() => void copySummary(client)} className={ITEM}>
              Copy summary
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        aria-label="Plan file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Cleared so choosing the same file again still fires a change.
          e.target.value = ''
          if (file) void importPlan(file, client)
        }}
      />
    </div>
  )
}
