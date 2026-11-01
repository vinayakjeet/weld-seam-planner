export type Units = 'mm' | 'in' | 'm' | 'unknown'
export type KnownUnits = Exclude<Units, 'unknown'>

const MM_PER_UNIT: Record<KnownUnits, number> = { mm: 1, in: 25.4, m: 1000 }

export function scaleToMm(units: KnownUnits): number {
  return MM_PER_UNIT[units]
}

// The spec only says a part under 10 units across is probably metres or inches.
// Splitting at 1 is a guess: below it an inch part would be under 25 mm, which
// is too small to weld, so metres is the likelier reading. The UI always asks.
export function guessUnits(maxDimension: number): Units {
  if (!Number.isFinite(maxDimension) || maxDimension < 0.001) return 'unknown'
  if (maxDimension >= 10) return 'mm'
  if (maxDimension >= 1) return 'in'
  return 'm'
}
