import type { JointType } from '../../core/seams/classify'
import type { SeamCandidate } from '../../core/seams/detect'
import { awsFor, type SeamPosition } from '../../core/torch/positions'
import type { SeamStatus } from '../../state/seamsSlice'

export interface SeamRow {
  id: string
  n: number
  label: string
  // Shown in the Type column: the joint type, with a question mark where the detector could not tell the inside from
  // the outside of the part.
  type: string
  jointType: JointType
  computedType: JointType
  overridden: boolean
  length: string
  // The position code, or a dash while the worker has not answered for this seam under the current gravity.
  pos: string
  position: SeamPosition | null
  status: SeamStatus | 'candidate'
}

export const JOINT_TYPES: readonly JointType[] = ['fillet', 'lap', 'corner', 'saddle']

export const jointLabel = (type: JointType) => type.charAt(0).toUpperCase() + type.slice(1)

const POSITION_NAMES: Record<string, string> = {
  PA: 'Flat',
  PB: 'Horizontal',
  PD: 'Overhead',
  PF: 'Vertical up',
  PG: 'Vertical down',
}

const oneDecimal = (x: number) => x.toFixed(1)

// The lines of the tooltip over a position chip.
export function positionLines(position: SeamPosition): string[] {
  const dominant = position.code.replace(/\+$/, '')
  const lines = [
    `${position.code} ${POSITION_NAMES[dominant] ?? ''} (AWS ${awsFor(position.code) ?? '?'})`.replace('  ', ' '),
    `Inclination ${oneDecimal(position.inclinationDeg)}\u00b0`,
    `Rotation ${oneDecimal(position.rotationDeg)}\u00b0`,
  ]
  const others = Object.entries(position.shares)
    .filter(([iso]) => iso !== dominant)
    .sort((a, b) => b[1] - a[1])
    .map(([iso, share]) => `${iso} ${Math.round(share * 100)}%`)
  if (others.length > 0) lines.push(`Also ${others.join(', ')}`)
  return lines
}

export function seamRows(
  seams: SeamCandidate[],
  statusById: Record<string, SeamStatus>,
  typeById: Record<string, JointType>,
  positionOf: (seam: SeamCandidate) => SeamPosition | undefined = () => undefined,
): SeamRow[] {
  return seams.map((seam, i) => {
    const override = typeById[seam.id]
    const jointType = override ?? seam.jointType
    const position = positionOf(seam) ?? null
    return {
      id: seam.id,
      n: i + 1,
      label: seam.label,
      type: jointLabel(jointType) + (override === undefined && seam.concavity === 'unknown' ? ' ?' : ''),
      jointType,
      computedType: seam.jointType,
      overridden: override !== undefined,
      length: String(Number(seam.lengthMm.toFixed(1))),
      pos: position ? position.code : '-',
      position,
      status: statusById[seam.id] ?? 'candidate',
    }
  })
}
