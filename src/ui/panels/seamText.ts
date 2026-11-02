export function acceptAllLabel(threshold: number): string {
  return `Accept all above ${threshold.toFixed(2)}`
}

export function hiddenAcceptedMessage(count: number): string | null {
  if (count <= 0) return null
  if (count === 1) return '1 accepted seam is hidden at this angle and returns if you move the slider back.'
  return `${count} accepted seams are hidden at this angle and return if you move the slider back.`
}

export function noSeamsMessage(hiddenCorners: number): string {
  if (hiddenCorners > 0) {
    const noun = hiddenCorners === 1 ? '1 corner candidate is' : `${hiddenCorners} corner candidates are`
    return `No fillet seams found at this crease angle, but ${noun} hidden. Turn on Show corner candidates in the Detection tab to list them, or lower the crease angle.`
  }
  return 'No seams found at this crease angle. Lower it in the Detection tab, or check that the plates of the part touch or overlap.'
}
