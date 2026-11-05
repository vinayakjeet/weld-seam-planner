import type { ArmParams } from '../../core/snake/arm'

export const ARM_FIELDS: ReadonlyArray<{ key: keyof ArmParams; label: string; unit: string }> = [
  { key: 'links', label: 'Links', unit: '' },
  { key: 'linkLengthMm', label: 'Link length', unit: 'mm' },
  { key: 'diameterMm', label: 'Diameter', unit: 'mm' },
  { key: 'maxBendDeg', label: 'Bend limit', unit: 'deg' },
  { key: 'torchLengthMm', label: 'Torch length', unit: 'mm' },
  { key: 'insertionMm', label: 'Insertion depth', unit: 'mm' },
  { key: 'clearanceMm', label: 'Clearance', unit: 'mm' },
]
