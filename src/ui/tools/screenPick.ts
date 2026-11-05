export interface ScreenPoint {
  x: number
  y: number
}

// Index of the sample nearest the cursor, or null when none is within maxPx. Samples off screen (not finite) are skipped.
export function nearestScreenIndex(samples: readonly ScreenPoint[], cursor: ScreenPoint, maxPx: number): number | null {
  let best: number | null = null
  let bestDistance = Infinity
  samples.forEach((sample, i) => {
    const distance = Math.hypot(sample.x - cursor.x, sample.y - cursor.y)
    if (distance <= maxPx && distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  })
  return best
}

// Occlusion needs a ray against the part for each candidate, so only the nearest few are asked about.
export const MAX_VISIBLE_CANDIDATES = 24

// Index of the sample nearest the cursor that isVisible accepts, or null when none in reach is. Candidates are asked in
// order of distance and the asking stops at the first visible one, so a part in front of the seam costs a few rays at most.
export function nearestVisibleScreenIndex(
  samples: readonly ScreenPoint[],
  cursor: ScreenPoint,
  maxPx: number,
  isVisible: (index: number) => boolean,
  maxCandidates = MAX_VISIBLE_CANDIDATES,
): number | null {
  const near: Array<{ index: number; distance: number }> = []
  samples.forEach((sample, index) => {
    const distance = Math.hypot(sample.x - cursor.x, sample.y - cursor.y)
    if (distance <= maxPx) near.push({ index, distance })
  })
  // Array.sort is stable, so equally close samples keep their order along the seam.
  near.sort((a, b) => a.distance - b.distance)
  for (const { index } of near.slice(0, maxCandidates)) if (isVisible(index)) return index
  return null
}
