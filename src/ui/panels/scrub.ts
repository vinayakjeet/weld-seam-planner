const STEP_MM = 1
const SHIFT_STEP_MM = 10
const FORWARD = new Set(['ArrowRight', 'ArrowUp'])
const BACK = new Set(['ArrowLeft', 'ArrowDown'])

// Signed millimetres a key moves the scrub: an arrow is 1 mm, with Shift 10 mm. Null for any other key.
export function scrubStep(key: string, shift: boolean): number | null {
  const size = shift ? SHIFT_STEP_MM : STEP_MM
  if (FORWARD.has(key)) return size
  if (BACK.has(key)) return -size
  return null
}

// Stops at the ends of an open seam and wraps round a closed one.
export function nudgeScrub(s: number, step: number, lengthMm: number, closed: boolean): number {
  if (!Number.isFinite(step)) return s
  if (!(lengthMm > 0)) return 0
  const moved = s + step
  return closed ? ((moved % lengthMm) + lengthMm) % lengthMm : Math.min(lengthMm, Math.max(0, moved))
}
