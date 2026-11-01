export type Units = 'mm' | 'in' | 'm' | 'unknown'

// The spec only says a part under 10 units across is probably metres or inches.
// Splitting at 1 is a guess: below it an inch part would be under 25 mm, which
// is too small to weld, so metres is the likelier reading. The UI always asks.
export function guessUnits(maxDimension: number): Units {
  if (!Number.isFinite(maxDimension) || maxDimension < 0.001) return 'unknown'
  if (maxDimension >= 10) return 'mm'
  if (maxDimension >= 1) return 'in'
  return 'm'
}
