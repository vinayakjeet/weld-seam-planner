export interface ConfidenceInput {
  lengthMm: number
  openingDeg: number
  medianAdjacentAreaMm2: number
  diagonal: number
}

// 0 to 1. A long seam, close to a 90 degree opening, between large faces scores highest. The opening angle range of
// a normal fillet (45 to 135) only lowers the score rather than removing the seam, so the crease slider stays useful
// below 45 degrees.
export function confidence({ lengthMm, openingDeg, medianAdjacentAreaMm2, diagonal }: ConfidenceInput): number {
  const lengthScore = Math.min(1, lengthMm / (0.1 * diagonal))
  const angleScore = Math.max(0, 1 - Math.abs(openingDeg - 90) / 45)
  const areaScore = Math.min(1, medianAdjacentAreaMm2 / (1e-3 * diagonal * diagonal))
  return 0.4 * lengthScore + 0.4 * angleScore + 0.2 * areaScore
}
