import { STEPS, useStore } from '../../state/store'
import { Dialog } from '../kit/Dialog'
import { SHORTCUT_HELP, type ShortcutHelpRow } from './shortcuts'

const GROUPS: ShortcutHelpRow['group'][] = ['View', 'Steps', 'Tools', 'Playback', 'File', 'History']

function labelOf(row: ShortcutHelpRow): string {
  if (!row.id.startsWith('step')) return row.label
  return `Go to ${STEPS[Number(row.id.slice(4)) - 1]!.label}`
}

export function ShortcutSheet() {
  const open = useStore((s) => s.helpOpen)
  const setOpen = useStore((s) => s.setHelpOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Keyboard shortcuts" description="Keys work anywhere except inside a text field. Press ? or Escape to close this list." wide>
      <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group} aria-label={group}>
            <h3 className="mb-1 text-xs font-semibold text-ink-0">{group}</h3>
            <ul className="flex flex-col gap-1">
              {SHORTCUT_HELP.filter((row) => row.group === group).map((row) => (
                <li key={row.id} className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-1">{labelOf(row)}</span>
                  <span className="flex shrink-0 gap-1">
                    {row.keys.map((keys, i) => (
                      <kbd key={keys} className="num rounded-sm border border-line bg-surface-2 px-1.5 text-[11px] text-ink-0">
                        {i > 0 ? `or ${keys}` : keys}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
