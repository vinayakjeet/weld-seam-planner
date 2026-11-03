// The part's material settings: solid, or see-through enough to show the seams inside it. No depth is written when it
// is see-through, so what lies behind the part is not hidden by it.
export function xrayMaterial(on: boolean): { opacity: number; transparent: boolean; depthWrite: boolean } {
  return on ? { opacity: 0.25, transparent: true, depthWrite: false } : { opacity: 1, transparent: false, depthWrite: true }
}
