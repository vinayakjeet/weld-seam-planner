export function acceptAllLabel(threshold: number): string {
  return `Accept all above ${threshold.toFixed(2)}`
}

export function hiddenAcceptedMessage(count: number): string | null {
  if (count <= 0) return null
  if (count === 1) return '1 accepted seam is hidden at this angle and returns if you move the slider back.'
  return `${count} accepted seams are hidden at this angle and return if you move the slider back.`
}

export function noSeamsMessage(hiddenCorners: number, hiddenHollow = 0): string {
  const kinds: Array<{ noun: string; toggle: string }> = []
  if (hiddenCorners > 0) {
    kinds.push({ noun: hiddenCorners === 1 ? '1 corner candidate' : `${hiddenCorners} corner candidates`, toggle: 'Show corner candidates' })
  }
  if (hiddenHollow > 0) {
    kinds.push({
      noun: hiddenHollow === 1 ? '1 seam inside a hollow section' : `${hiddenHollow} seams inside hollow sections`,
      toggle: 'Show seams inside hollow sections',
    })
  }
  if (kinds.length > 0) {
    const verb = hiddenCorners + hiddenHollow === 1 ? 'is' : 'are'
    return `No fillet seams found at this crease angle, but ${kinds.map((k) => k.noun).join(' and ')} ${verb} hidden. Turn on ${kinds.map((k) => k.toggle).join(' or ')} in the Detection tab to list them, or lower the crease angle.`
  }
  return 'No seams found at this crease angle. Lower it in the Detection tab, or check that the plates of the part touch or overlap.'
}
