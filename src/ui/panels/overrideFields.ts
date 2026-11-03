import type { Explained } from '../../core/job/plan'
import type { Procedure, ProcedureOverrides } from '../../core/job/schema'

export interface OverrideField {
  key: 'current' | 'voltage' | 'wireFeed' | 'travel' | 'ctwd' | 'workAngle' | 'travelAngle' | 'gasFlow'
  label: string
  unit: string
  path: readonly [string, string] | readonly [string]
  min: 'positive' | 'nonneg' | 'any'
}

export const OVERRIDE_FIELDS: readonly OverrideField[] = [
  { key: 'current', label: 'Current', unit: 'A', path: ['electrical', 'currentA'], min: 'positive' },
  { key: 'voltage', label: 'Voltage', unit: 'V', path: ['electrical', 'voltageV'], min: 'positive' },
  { key: 'wireFeed', label: 'Wire feed', unit: 'm/min', path: ['electrical', 'wireFeedMpm'], min: 'positive' },
  { key: 'travel', label: 'Travel speed', unit: 'mm/s', path: ['travelSpeedMmS'], min: 'positive' },
  { key: 'ctwd', label: 'Contact tip distance', unit: 'mm', path: ['ctwdMm'], min: 'positive' },
  { key: 'workAngle', label: 'Work angle offset', unit: 'deg', path: ['torch', 'workAngleOffsetDeg'], min: 'any' },
  { key: 'travelAngle', label: 'Travel angle', unit: 'deg', path: ['torch', 'travelAngleDeg'], min: 'nonneg' },
  { key: 'gasFlow', label: 'Gas flow', unit: 'L/min', path: ['gas', 'flowLpm'], min: 'positive' },
]

type Plain = Record<string, unknown>

function at(source: unknown, path: readonly string[]): unknown {
  let node = source
  for (const step of path) node = (node as Plain | undefined | null)?.[step]
  return node
}

export function valueOf(procedure: Procedure, field: OverrideField): number | null {
  const value = at(procedure, field.path)
  return typeof value === 'number' ? value : null
}

export function isOverridden(overrides: ProcedureOverrides, field: OverrideField): boolean {
  return at(overrides, field.path) !== undefined
}

export const parseOverrideInput = (field: OverrideField, text: string): ParsedOverride => parseNumberInput(field, text)

export const MIXED = 'mixed'

// The value every seam shares, or "mixed" when they differ.
export function sharedValue<T>(values: readonly T[]): T | typeof MIXED {
  const [first] = values
  return values.every((v) => v === first) ? (first as T) : MIXED
}

// undefined removes the override for that field.
export function patchFor(field: OverrideField, value: number | undefined): ProcedureOverrides {
  const [outer, inner] = field.path
  return (inner === undefined ? { [outer]: value } : { [outer]: { [inner]: value } }) as ProcedureOverrides
}

export type ParsedOverride = { kind: 'clear' } | { kind: 'set'; value: number } | { kind: 'error'; error: Explained }

export interface NumberSpec {
  label: string
  unit: string
  min: 'positive' | 'nonneg' | 'any'
}

// Empty text means "go back to the default", so it is not an error.
export function parseNumberInput(field: NumberSpec, text: string): ParsedOverride {
  const trimmed = text.trim()
  if (trimmed === '') return { kind: 'clear' }
  const value = Number(trimmed.replace(',', '.'))
  const next = `Type a number in ${field.unit}, or clear the field to use the procedure's value.`
  if (!Number.isFinite(value)) {
    return { kind: 'error', error: { what: `${field.label} must be a number.`, why: `"${trimmed}" is not a number, so it cannot be used as ${field.unit}.`, next } }
  }
  if (field.min === 'positive' && value <= 0) {
    return { kind: 'error', error: { what: `${field.label} must be above 0 ${field.unit}.`, why: 'The calculators divide by or multiply with this value, so zero or less gives no answer.', next } }
  }
  if (field.min === 'nonneg' && value < 0) {
    return { kind: 'error', error: { what: `${field.label} cannot be below 0 ${field.unit}.`, why: 'A negative angle here would turn the torch the wrong way; use the technique setting to drag instead.', next } }
  }
  return { kind: 'set', value }
}
