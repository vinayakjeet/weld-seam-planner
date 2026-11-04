import { useMemo, useState } from 'react'
import type { Explained } from '../../core/job/plan'
import { WPS_PRESETS, blankProcedure, duplicateProcedure } from '../../core/process/wps'
import { useStore } from '../../state/store'
import { Button } from '../kit/Button'
import { ProcedureEditor, STARTING_POINT, type EditorTarget } from './ProcedureEditor'
import { libraryLine } from './procedureForm'

const PRESET_IDS = new Set(WPS_PRESETS.map((p) => p.id))
const COMPACT = 'h-7 px-2.5'

export function ProcedureLibrary() {
  const procedures = useStore((s) => s.procedures)
  const procedureById = useStore((s) => s.procedureById)
  const deleteProcedure = useStore((s) => s.deleteProcedure)
  const [chosen, setChosen] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [refusal, setRefusal] = useState<Explained | null>(null)

  const users = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const id of Object.values(procedureById)) counts[id] = (counts[id] ?? 0) + 1
    return counts
  }, [procedureById])
  const current = procedures.find((p) => p.id === chosen) ?? procedures[0]
  const ids = procedures.map((p) => p.id)

  return (
    <section aria-label="Procedure library" className="flex shrink-0 flex-col gap-2 border-b border-line px-3 py-2">
      <ul className="max-h-52 overflow-y-auto border border-line">
        {procedures.map((p) => (
          <li key={p.id} className="border-b border-line/50 last:border-b-0">
            <button
              type="button"
              aria-pressed={current?.id === p.id}
              onClick={() => {
                setChosen(p.id)
                setRefusal(null)
              }}
              className={`flex w-full flex-col gap-0.5 px-2 py-1.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand ${
                current?.id === p.id ? 'bg-brand/20' : 'hover:bg-surface-2'
              }`}
            >
              <span className="truncate text-ink-0">{p.name}</span>
              <span className="truncate text-[11px] text-ink-1">{libraryLine(p, users[p.id] ?? 0)}</span>
              {PRESET_IDS.has(p.id) && <span className="text-[11px] text-ink-2">{STARTING_POINT}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <Button className={COMPACT} onClick={() => setEditor({ kind: 'new', procedure: blankProcedure(ids) })}>
          New
        </Button>
        <Button className={COMPACT} disabled={!current} onClick={() => current && setEditor({ kind: 'duplicate', procedure: duplicateProcedure(current, ids) })}>
          Duplicate
        </Button>
        <Button className={COMPACT} disabled={!current} onClick={() => current && setEditor({ kind: 'edit', procedure: current })}>
          Edit
        </Button>
        <Button
          className={COMPACT}
          disabled={!current}
          onClick={() => {
            if (!current) return
            const problem = deleteProcedure(current.id)
            setRefusal(problem)
            if (!problem) setChosen(null)
          }}
        >
          Delete
        </Button>
      </div>
      {refusal && (
        <p role="alert" className="border-l-2 border-warn pl-2 text-ink-0">
          {refusal.what} {refusal.why} {refusal.next}
        </p>
      )}
      <ProcedureEditor target={editor} onClose={() => setEditor(null)} />
    </section>
  )
}
