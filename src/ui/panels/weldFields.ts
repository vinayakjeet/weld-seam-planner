import type { Explained } from '../../core/job/plan'
import { WELD_TOLERANCE_RANGE } from '../../core/mesh/weld'
import { contactTolerance, MAX_TOLERANCE_MM, MIN_TOLERANCE_MM, TOLERANCE_FRACTION } from '../../core/seams/contact'

const significant = (x: number) => String(Number(x.toPrecision(3)))

export const contactToleranceText = (diagonalMm: number) =>
  `Two bodies count as touching up to ${significant(contactTolerance(diagonalMm))} mm apart on this part: ${TOLERANCE_FRACTION * 100} percent of its ${significant(diagonalMm)} mm diagonal, at most ${MAX_TOLERANCE_MM} mm and at least ${MIN_TOLERANCE_MM} mm.`

export const weldMmText = (weldTolerance: number, diagonalMm: number) => significant(weldTolerance * diagonalMm)

const rangeMm = (diagonalMm: number) => `${significant(WELD_TOLERANCE_RANGE.min * diagonalMm)} to ${significant(WELD_TOLERANCE_RANGE.max * diagonalMm)} mm`

export const weldRangeText = (diagonalMm: number) =>
  `${rangeMm(diagonalMm)} for this part (${WELD_TOLERANCE_RANGE.min.toExponential(0)} to ${WELD_TOLERANCE_RANGE.max.toExponential(0)} of its ${significant(diagonalMm)} mm diagonal)`

// A value that three significant figures rounded just past an end of the range is taken as that end.
const SLACK = 1.01

// The box takes millimetres; the plan keeps the fraction of the diagonal, so the same tolerance means the same on another part.
export function parseWeldMm(text: string, diagonalMm: number): { weldTolerance: number } | { error: Explained } {
  const trimmed = text.trim().replace(',', '.')
  const mm = Number(trimmed)
  if (trimmed === '' || !Number.isFinite(mm)) {
    return {
      error: {
        what: 'The weld tolerance was not changed because the text is not a number.',
        why: 'The field takes a length in millimetres such as 0.05.',
        next: `Type a number from ${rangeMm(diagonalMm)}, then press Enter.`,
      },
    }
  }
  const fraction = mm / diagonalMm
  if (fraction < WELD_TOLERANCE_RANGE.min / SLACK || fraction > WELD_TOLERANCE_RANGE.max * SLACK) {
    return {
      error: {
        what: `A weld tolerance of ${significant(mm)} mm was not used.`,
        why: `The tolerance has to stay between ${weldRangeText(diagonalMm)}: smaller would weld nothing a file's own rounding leaves apart, larger would merge parts of thin plates.`,
        next: 'Type a value inside that range, then press Enter.',
      },
    }
  }
  return { weldTolerance: Math.min(WELD_TOLERANCE_RANGE.max, Math.max(WELD_TOLERANCE_RANGE.min, fraction)) }
}
