export interface ConfidenceInput {
  lengthMm: number
  openingDeg: number
  medianAdjacentAreaMm2: number
  diagonal: number
  // A contact or intersection seam: two separate bodies meet along it.
  betweenBodies?: boolean
}

// 0 to 1. A long seam, close to a 90 degree opening, between large faces scores highest. The opening angle range of
// a normal fillet (45 to 135) only lowers the score rather than removing the seam, so the crease slider stays useful
// below 45 degrees. Two separate bodies that meet along a line are the strongest sign of a weld in an assembly, and
// their joint is only as long as the members are wide, so its length against the whole part counts in full: a short
// tube end on a large frame scores like a long crease.
export function confidence({ lengthMm, openingDeg, medianAdjacentAreaMm2, diagonal, betweenBodies = false }: ConfidenceInput): number {
  const lengthScore = betweenBodies ? 1 : Math.min(1, lengthMm / (0.1 * diagonal))
  const angleScore = Math.max(0, 1 - Math.abs(openingDeg - 90) / 45)
  const areaScore = Math.min(1, medianAdjacentAreaMm2 / (1e-3 * diagonal * diagonal))
  return 0.4 * lengthScore + 0.4 * angleScore + 0.2 * areaScore
}
