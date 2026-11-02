import type { JointType } from '../../core/seams/classify'
import type { SeamCandidate } from '../../core/seams/detect'
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
  status: SeamStatus | 'candidate'
}

export const JOINT_TYPES: readonly JointType[] = ['fillet', 'lap', 'corner', 'saddle']

export const jointLabel = (type: JointType) => type.charAt(0).toUpperCase() + type.slice(1)

export function seamRows(
  seams: SeamCandidate[],
  statusById: Record<string, SeamStatus>,
  typeById: Record<string, JointType>,
): SeamRow[] {
  return seams.map((seam, i) => {
    const override = typeById[seam.id]
    const jointType = override ?? seam.jointType
    return {
      id: seam.id,
      n: i + 1,
      label: seam.label,
      type: jointLabel(jointType) + (override === undefined && seam.concavity === 'unknown' ? ' ?' : ''),
      jointType,
      computedType: seam.jointType,
      overridden: override !== undefined,
      length: String(Number(seam.lengthMm.toFixed(1))),
      status: statusById[seam.id] ?? 'candidate',
    }
  })
}
