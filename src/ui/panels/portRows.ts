import type { Vec3 } from '../../core/math/vec3'
import type { Port } from '../../core/snake/arm'

// Rounded, without trailing zeros, and never a negative zero.
function trimmed(value: number, digits: number): string {
  return String(parseFloat(value.toFixed(digits)))
}

const list = (v: Vec3, digits: number) => v.map((n) => trimmed(n, digits)).join(', ')

export function portRows(ports: Port[]): Array<{ id: string; position: string; direction: string; diameter: string }> {
  return ports.map((port) => ({
    id: port.id,
    position: list(port.position, 1),
    direction: list(port.direction, 3),
    diameter: trimmed(port.diameterMm, 1),
  }))
}

export function portNumber(id: string): number {
  const match = /^P(\d+)$/.exec(id)
  return match ? Number(match[1]) : 0
}

export function nextPortId(ports: Port[]): string {
  return `P${Math.max(0, ...ports.map((p) => portNumber(p.id))) + 1}`
}
