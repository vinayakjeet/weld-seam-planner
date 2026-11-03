import type { AccessClass } from '../../core/access/clearance'

const LINES: Record<AccessClass, string> = {
  standard: 'any robot torch',
  slim: 'slim or swan-neck torch',
  snake: 'needs a snake arm entering through an opening',
  blocked: 'no tool can reach; weld manually or change the design',
}

const LABELS: Record<AccessClass, string> = { standard: 'Standard', slim: 'Slim', snake: 'Snake', blocked: 'Blocked' }

const CHIPS: Record<AccessClass, string> = { standard: 'STD', slim: 'SLM', snake: 'SNK', blocked: 'BLK' }

export const ACCESS_CLASSES: readonly AccessClass[] = ['standard', 'slim', 'snake', 'blocked']

// What a class asks of the tool, as the one line shown under the chip.
export const accessLine = (cls: AccessClass): string => LINES[cls]

export const accessLabel = (cls: AccessClass): string => LABELS[cls]

export const accessChipText = (cls: AccessClass): string => CHIPS[cls]

export const clearanceText = (deg: number): string => `${Math.round(deg)}°`

export function intervalsText(intervals: ReadonlyArray<readonly [number, number]>): string {
  return intervals.map(([from, to]) => `${Math.round(from)} to ${Math.round(to)} mm`).join(', ')
}
