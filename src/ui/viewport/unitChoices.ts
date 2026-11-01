import { scaleToMm, type KnownUnits, type Units } from '../../core/mesh/units'

export const UNIT_CHOICES: { units: KnownUnits; label: string }[] = [
  { units: 'mm', label: 'Millimetres (mm)' },
  { units: 'in', label: 'Inches (in)' },
  { units: 'm', label: 'Metres (m)' },
]

// When the size is too small to guess from, millimetres is the least surprising starting point.
export function defaultUnits(guess: Units): KnownUnits {
  return guess === 'unknown' ? 'mm' : guess
}

export function sizeInMm(maxDimension: number, units: KnownUnits): number {
  return maxDimension * scaleToMm(units)
}
