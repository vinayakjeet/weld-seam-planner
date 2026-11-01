export function acceptAllLabel(threshold: number): string {
  return `Accept all above ${threshold.toFixed(2)}`
}

export function hiddenAcceptedMessage(count: number): string | null {
  if (count <= 0) return null
  if (count === 1) return '1 accepted seam is hidden at this angle and returns if you move the slider back.'
  return `${count} accepted seams are hidden at this angle and return if you move the slider back.`
}
