import type { Explained } from '../../core/job/plan'
import { ISO_POSITIONS, procedureSchema, type Procedure } from '../../core/job/schema'
import { PROCESSES } from '../../core/process/heatInput'

export type FormKey =
  | 'id' | 'name' | 'process' | 'transfer' | 'spec' | 'thicknessLo' | 'thicknessHi'
  | 'wireClass' | 'wireDiameter' | 'gasMix' | 'gasFlow'
  | 'current' | 'voltage' | 'wireFeed' | 'polarity'
  | 'travel' | 'ctwd' | 'workAngle' | 'travelAngle' | 'technique'
  | 'weavePattern' | 'weaveAmp' | 'weaveFreq' | 'weaveDwell'
  | 'preflow' | 'craterFill' | 'burnback' | 'postflow'
  | 'efficiency' | 'preheat' | 'interpass'

export type ProcedureForm = Record<FormKey, string> & { positions: string[] }

type Min = 'positive' | 'nonneg' | 'any' | 'fraction'

export interface FormField {
  key: FormKey
  label: string
  unit: string
  group: string
  kind: 'text' | 'number' | 'choice'
  path: Array<string | number>
  min?: Min
  optional?: boolean
  options?: readonly string[]
  why?: string
}

const NUMBER_WHY = 'The heat input, travel speed and torch pose calculations need a usable number here.'

const f = (key: FormKey, label: string, group: string, kind: FormField['kind'], path: FormField['path'], extra: Partial<FormField> = {}): FormField => ({
  key, label, group, kind, path, unit: '', ...extra,
})

export const FORM_FIELDS: readonly FormField[] = [
  f('id', 'Id', 'Identity', 'text', ['id'], { why: 'Seams refer to a procedure by its id.' }),
  f('name', 'Name', 'Identity', 'text', ['name']),
  f('process', 'Process', 'Process and material', 'choice', ['process'], { options: PROCESSES }),
  f('transfer', 'Metal transfer', 'Process and material', 'choice', ['transfer'], { options: ['short-circuit', 'spray', 'pulse'], optional: true }),
  f('spec', 'Base material', 'Process and material', 'text', ['baseMaterial', 'spec']),
  f('thicknessLo', 'Thinnest plate', 'Process and material', 'number', ['baseMaterial', 'thicknessMm', 0], { unit: 'mm', min: 'positive' }),
  f('thicknessHi', 'Thickest plate', 'Process and material', 'number', ['baseMaterial', 'thicknessMm', 1], { unit: 'mm', min: 'positive' }),
  f('wireClass', 'Filler', 'Wire and gas', 'text', ['wire', 'classification']),
  f('wireDiameter', 'Wire diameter', 'Wire and gas', 'number', ['wire', 'diameterMm'], { unit: 'mm', min: 'positive' }),
  f('gasMix', 'Gas mix', 'Wire and gas', 'text', ['gas', 'mix'], { optional: true }),
  f('gasFlow', 'Gas flow', 'Wire and gas', 'number', ['gas', 'flowLpm'], { unit: 'L/min', min: 'positive', optional: true }),
  f('current', 'Current', 'Electrical', 'number', ['electrical', 'currentA'], { unit: 'A', min: 'positive' }),
  f('voltage', 'Voltage', 'Electrical', 'number', ['electrical', 'voltageV'], { unit: 'V', min: 'positive' }),
  f('wireFeed', 'Wire feed speed', 'Electrical', 'number', ['electrical', 'wireFeedMpm'], { unit: 'm/min', min: 'positive', optional: true }),
  f('polarity', 'Polarity', 'Electrical', 'choice', ['electrical', 'polarity'], { options: ['DCEP', 'DCEN', 'AC'] }),
  f('travel', 'Travel speed', 'Travel and torch', 'number', ['travelSpeedMmS'], {
    unit: 'mm/s', min: 'positive', why: 'Heat input is energy divided by travel speed, so a speed of zero or less gives no answer.',
  }),
  f('ctwd', 'Contact tip distance', 'Travel and torch', 'number', ['ctwdMm'], { unit: 'mm', min: 'positive', optional: true }),
  f('workAngle', 'Work angle offset', 'Travel and torch', 'number', ['torch', 'workAngleOffsetDeg'], { unit: 'deg', min: 'any' }),
  f('travelAngle', 'Travel angle', 'Travel and torch', 'number', ['torch', 'travelAngleDeg'], { unit: 'deg', min: 'nonneg' }),
  f('technique', 'Technique', 'Travel and torch', 'choice', ['torch', 'technique'], { options: ['push', 'drag'] }),
  f('weavePattern', 'Weave pattern', 'Weave', 'choice', ['weave', 'pattern'], { options: ['none', 'zigzag', 'triangle', 'circle'] }),
  f('weaveAmp', 'Weave amplitude', 'Weave', 'number', ['weave', 'amplitudeMm'], { unit: 'mm', min: 'nonneg' }),
  f('weaveFreq', 'Weave frequency', 'Weave', 'number', ['weave', 'frequencyHz'], { unit: 'Hz', min: 'nonneg' }),
  f('weaveDwell', 'Weave dwell', 'Weave', 'number', ['weave', 'dwellMs'], { unit: 'ms', min: 'nonneg' }),
  f('preflow', 'Pre-flow', 'Arc start and end', 'number', ['arcStart', 'preflowS'], { unit: 's', min: 'nonneg' }),
  f('craterFill', 'Crater fill', 'Arc start and end', 'number', ['arcEnd', 'craterFillS'], { unit: 's', min: 'nonneg' }),
  f('burnback', 'Burnback', 'Arc start and end', 'number', ['arcEnd', 'burnbackMs'], { unit: 'ms', min: 'nonneg' }),
  f('postflow', 'Post-flow', 'Arc start and end', 'number', ['arcEnd', 'postflowS'], { unit: 's', min: 'nonneg' }),
  f('efficiency', 'Thermal efficiency', 'Heat', 'number', ['thermalEfficiency'], { min: 'fraction' }),
  f('preheat', 'Preheat', 'Heat', 'number', ['preheatC'], { unit: 'deg C', min: 'any' }),
  f('interpass', 'Maximum interpass', 'Heat', 'number', ['interpassMaxC'], { unit: 'deg C', min: 'any' }),
]

export const FORM_GROUPS: readonly string[] = [...new Set(FORM_FIELDS.map((field) => field.group))]

function read(source: unknown, path: FormField['path']): unknown {
  let node = source
  for (const step of path) node = (node as Record<string | number, unknown> | undefined | null)?.[step]
  return node
}

function write(target: unknown, path: FormField['path'], value: unknown): void {
  let node = target as Record<string | number, unknown>
  for (const step of path.slice(0, -1)) {
    node[step] ??= {}
    node = node[step] as Record<string | number, unknown>
  }
  const last = path[path.length - 1]!
  if (value === undefined) delete node[last]
  else node[last] = value
}

export function toForm(procedure: Procedure): ProcedureForm {
  const form = { positions: [...procedure.positions] } as ProcedureForm
  for (const field of FORM_FIELDS) {
    const value = read(procedure, field.path)
    form[field.key] = value === undefined || value === null ? '' : String(value)
  }
  return form
}

const refuse = (what: string, why: string, next: string): Explained => ({ what, why, next })

function numberProblem(field: FormField, text: string, value: number): Explained | null {
  const { label, unit } = field
  const withUnit = unit === '' ? '' : ` ${unit}`
  const next = `Enter a number for ${label}${unit === '' ? '' : ` in ${unit}`}, then save again.`
  const why = field.why ?? NUMBER_WHY
  if (!Number.isFinite(value)) return refuse(`${label} must be a number.`, `"${text}" is not a number, so it cannot be used.`, next)
  if (field.min === 'positive' && value <= 0) return refuse(`${label} must be above 0${withUnit}.`, why, next)
  if (field.min === 'nonneg' && value < 0) return refuse(`${label} cannot be below 0${withUnit}.`, why, next)
  if (field.min === 'fraction' && (value <= 0 || value > 1)) {
    return refuse(`${label} must be above 0 and at most 1.`, 'It is the share of the arc energy that goes into the work, so it cannot exceed 1.', 'Use the process factor, for example 0.8 for GMAW.')
  }
  return null
}

export type FormResult = { ok: true; procedure: Procedure } | { ok: false; errors: Partial<Record<FormKey | 'positions', Explained>> }

// takenIds are the ids of the library; ownId is the id this form started from, which it may keep.
export function fromForm(form: ProcedureForm, base: Procedure, takenIds: readonly string[] = [], ownId?: string): FormResult {
  const errors: Partial<Record<FormKey | 'positions', Explained>> = {}
  const out = structuredClone(base) as Procedure
  const gasEmpty = form.gasMix.trim() === '' && form.gasFlow.trim() === ''

  for (const field of FORM_FIELDS) {
    const text = form[field.key].trim()
    const optional = field.optional === true || (gasEmpty && (field.key === 'gasMix' || field.key === 'gasFlow'))
    if (text === '') {
      if (!optional) {
        errors[field.key] = refuse(`${field.label} is required.`, field.why ?? 'The procedure cannot be used without it.', `Fill in ${field.label}, then save again.`)
      } else if (field.key === 'gasMix' || field.key === 'gasFlow') {
        if (!gasEmpty) errors[field.key] = refuse(`${field.label} is required when a ${field.key === 'gasMix' ? 'gas flow' : 'gas mix'} is set.`, 'Shielding gas needs both a mix and a flow.', `Fill in ${field.label}, or clear the other gas field.`)
      } else {
        write(out, field.path, field.key === 'ctwd' ? null : undefined)
      }
      continue
    }
    if (field.kind === 'number') {
      const value = Number(text)
      const problem = numberProblem(field, text, value)
      if (problem) errors[field.key] = problem
      else write(out, field.path, value)
    } else if (field.kind === 'choice' && !field.options!.includes(text)) {
      errors[field.key] = refuse(`${field.label} must be one of ${field.options!.join(', ')}.`, `"${text}" is not one of the choices.`, `Pick a ${field.label.toLowerCase()} from the list.`)
    } else {
      write(out, field.path, text)
    }
  }
  if (gasEmpty) delete (out as { gas?: unknown }).gas

  if (form.positions.length === 0) {
    errors.positions = refuse('Choose at least one welding position.', 'Pre-flight checks each seam against the positions of its procedure.', 'Tick the positions this procedure is qualified for.')
  } else {
    out.positions = ISO_POSITIONS.filter((p) => form.positions.includes(p))
  }

  const id = form.id.trim()
  if (errors.id === undefined && id !== ownId && takenIds.includes(id)) {
    errors.id = refuse(`The id ${id} is already used by another procedure.`, 'Seams refer to a procedure by its id, so two procedures with the same id would be ambiguous.', 'Choose an id that no other procedure uses.')
  }

  if (Object.keys(errors).length === 0) {
    const parsed = procedureSchema.safeParse(out)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const where = issue.path.join('.')
        const match = FORM_FIELDS.slice().reverse().find((field) => field.path.join('.').startsWith(where))
        errors[match?.key ?? 'name'] ??= refuse(issue.message, 'The saved procedure has to pass the same check as an exported file.', 'Correct this field, then save again.')
      }
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, procedure: out }
}

export function libraryLine(procedure: Procedure, users: number): string {
  const kind = procedure.transfer ? `${procedure.process} ${procedure.transfer}` : procedure.process
  const used = users === 0 ? 'not used' : `used by ${users} ${users === 1 ? 'seam' : 'seams'}`
  return `${kind}, ${procedure.positions.join(' ')}, ${used}`
}
