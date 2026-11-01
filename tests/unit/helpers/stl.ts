export type Tri = number[]

export function makeBinaryStl(tris: Tri[], header = 'test'): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + 50 * tris.length)
  const view = new DataView(buffer)
  for (let i = 0; i < Math.min(header.length, 80); i++) view.setUint8(i, header.charCodeAt(i))
  view.setUint32(80, tris.length, true)
  tris.forEach((tri, t) => {
    for (let i = 0; i < 9; i++) view.setFloat32(84 + 50 * t + 12 + 4 * i, tri[i]!, true)
  })
  return buffer
}

interface AsciiOptions {
  eol?: string
  upper?: boolean
}

export function makeAsciiStl(tris: Tri[], { eol = '\n', upper = false }: AsciiOptions = {}): ArrayBuffer {
  const word = (w: string) => (upper ? w.toUpperCase() : w)
  const lines = [`${word('solid')} part`]
  for (const tri of tris) {
    lines.push(`  ${word('facet normal')} 0 0 1`, `    ${word('outer loop')}`)
    for (let v = 0; v < 3; v++) lines.push(`      ${word('vertex')} ${tri[v * 3]} ${tri[v * 3 + 1]} ${tri[v * 3 + 2]}`)
    lines.push(`    ${word('endloop')}`, `  ${word('endfacet')}`)
  }
  lines.push(`${word('endsolid')} part`, '')
  return new TextEncoder().encode(lines.join(eol)).buffer as ArrayBuffer
}

export const TRIANGLES: Tri[] = [
  [0, 0, 0, 10, 0, 0, 0, 10, 0],
  [10, 0, 0, 10, 10, 0, 0, 10, 0],
  [0, 0, 5, 10, 0, 5, 0, 10, 5],
  [10, 0, 5, 10, 10, 5, 0, 10, 5],
]
