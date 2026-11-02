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
