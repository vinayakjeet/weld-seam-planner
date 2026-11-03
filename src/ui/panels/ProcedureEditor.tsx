import { useMemo, useState } from 'react'
import type { Explained } from '../../core/job/plan'
import { ISO_POSITIONS, type Procedure } from '../../core/job/schema'
import { useStore } from '../../state/store'
import { Button } from '../kit/Button'
import { Dialog } from '../kit/Dialog'
import { FORM_FIELDS, FORM_GROUPS, fromForm, toForm, type FormField, type ProcedureForm } from './procedureForm'

export const STARTING_POINT = 'Starting point, not a qualified procedure'

export interface EditorTarget {
  kind: 'new' | 'duplicate' | 'edit'
  procedure: Procedure
}

const TITLES = { new: 'New procedure', duplicate: 'Duplicate procedure', edit: 'Edit procedure' } as const

const INPUT =
  'h-7 w-full min-w-0 rounded-sm border border-line bg-surface-2 px-2 text-ink-0 outline-none focus-visible:border-brand aria-[invalid=true]:border-err'

function FieldBox({ field, form, problem, onChange }: { field: FormField; form: ProcedureForm; problem: Explained | undefined; onChange: (value: string) => void }) {
  const id = `proc-${field.key}`
  const common = {
    id,
    value: form[field.key],
    'aria-invalid': problem !== undefined,
    'aria-describedby': problem ? `${id}-problem` : undefined,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <label htmlFor={id} className="text-ink-1">
        {field.label}
        {field.unit && <span className="text-ink-2">{`, ${field.unit}`}</span>}
      </label>
      {field.kind === 'choice' ? (
        <select {...common} className={INPUT}>
          {field.optional && <option value="">None</option>}
          {field.options!.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input {...common} type="text" inputMode={field.kind === 'number' ? 'decimal' : 'text'} autoComplete="off" spellCheck={false} className={`${INPUT} ${field.kind === 'number' ? 'num text-right' : ''}`} />
      )}
      {problem && (
        <p id={`${id}-problem`} className="text-[11px] text-err" title={problem.why}>
          {problem.what} {problem.next}
        </p>
      )}
    </div>
  )
}

function EditorForm({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const procedures = useStore((s) => s.procedures)
  const addProcedure = useStore((s) => s.addProcedure)
  const updateProcedure = useStore((s) => s.updateProcedure)
  const [form, setForm] = useState(() => toForm(target.procedure))
  const [refusal, setRefusal] = useState<Explained | null>(null)
  const ownId = target.kind === 'edit' ? target.procedure.id : undefined
  const result = useMemo(() => fromForm(form, target.procedure, procedures.map((p) => p.id), ownId), [form, target.procedure, procedures, ownId])
  const errors = result.ok ? {} : result.errors

  const save = () => {
    if (!result.ok) return
    const problem = target.kind === 'edit' ? updateProcedure(target.procedure.id, result.procedure) : addProcedure(result.procedure)
    if (problem) setRefusal(problem)
    else onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="mt-3 flex flex-col gap-4"
    >
      {FORM_GROUPS.map((group) => (
        <fieldset key={group} className="min-w-0 border-t border-line pt-2">
          <legend className="pr-2 text-xs font-semibold text-ink-0">{group}</legend>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {FORM_FIELDS.filter((field) => field.group === group).map((field) => (
              <FieldBox key={field.key} field={field} form={form} problem={errors[field.key]} onChange={(value) => setForm({ ...form, [field.key]: value })} />
            ))}
          </div>
          {group === 'Process and material' && (
            <div className="mt-2">
              <p className="mb-1 text-ink-1">Welding positions</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {ISO_POSITIONS.map((position) => (
                  <label key={position} className="flex items-center gap-1 text-ink-0">
                    <input
                      type="checkbox"
                      checked={form.positions.includes(position)}
                      onChange={(e) => setForm({ ...form, positions: e.target.checked ? [...form.positions, position] : form.positions.filter((p) => p !== position) })}
                      className="accent-brand"
                    />
                    {position}
                  </label>
                ))}
              </div>
              {errors.positions && (
                <p className="mt-0.5 text-[11px] text-err" title={errors.positions.why}>
                  {errors.positions.what} {errors.positions.next}
                </p>
              )}
            </div>
          )}
        </fieldset>
      ))}
      {refusal && (
        <p role="alert" className="border-l-2 border-err pl-2 text-err">
          {refusal.what} {refusal.why} {refusal.next}
        </p>
      )}
      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!result.ok}>
          Save procedure
        </Button>
      </div>
    </form>
  )
}

export function ProcedureEditor({ target, onClose }: { target: EditorTarget | null; onClose: () => void }) {
  return (
    <Dialog
      wide
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={target ? TITLES[target.kind] : TITLES.edit}
      description={`${STARTING_POINT}. Check every value against your own qualified procedure before welding.`}
    >
      {target && <EditorForm key={`${target.kind}:${target.procedure.id}`} target={target} onClose={onClose} />}
    </Dialog>
  )
}
