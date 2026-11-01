export type StlErrorCode = 'empty' | 'too-short' | 'size-mismatch' | 'not-stl' | 'no-triangles' | 'non-finite'

export class StlError extends Error {
  code: StlErrorCode
  what: string
  why: string
  next: string

  constructor(code: StlErrorCode, what: string, why: string, next: string) {
    super(`${what} ${why} ${next}`)
    this.name = 'StlError'
    this.code = code
    this.what = what
    this.why = why
    this.next = next
  }
}

// Triangle soup: 9 floats per triangle, still in the file's units.
export interface RawMesh {
  positions: Float32Array
  triangleCount: number
}

const HEADER_BYTES = 84
const RECORD_BYTES = 50
const SNIFF_BYTES = 512
const REEXPORT = 'Export the part again from your CAD tool and try again.'

function notFinite(triangle: number): StlError {
  return new StlError(
    'non-finite',
    `Triangle ${triangle} contains a value that is not a number.`,
    'A coordinate is NaN or infinite, which usually means the export failed or the file is corrupt.',
    'Export the part again. If it keeps happening, repair the mesh in your CAD tool first.',
  )
}

function noTriangles(): StlError {
  return new StlError(
    'no-triangles',
    'The file contains no triangles.',
    'The STL structure is valid but its triangle list is empty.',
    'Check that the part was visible and not empty when exported, then export it again.',
  )
}

function badAscii(facet: number): StlError {
  return new StlError(
    'not-stl',
    `The ASCII STL is damaged near facet ${facet}.`,
    'Every facet must list exactly three vertex lines with three numbers each.',
    REEXPORT,
  )
}

export function parseStl(buffer: ArrayBuffer): RawMesh {
  const size = buffer.byteLength
  if (size === 0) {
    throw new StlError(
      'empty',
      'The file is empty (0 bytes).',
      'An STL file needs at least one triangle, so there is nothing to read.',
      'Check that the export finished and the file is not zero bytes, then try again.',
    )
  }

  // The size formula wins over the header text: many exporters start a binary header with "solid".
  const declared = size >= HEADER_BYTES ? new DataView(buffer).getUint32(80, true) : 0
  if (size >= HEADER_BYTES && HEADER_BYTES + RECORD_BYTES * declared === size) return parseBinary(buffer, declared)

  const head = new Uint8Array(buffer, 0, Math.min(size, SNIFF_BYTES))
  if (!head.includes(0)) {
    if (/^\s*solid(\s|$)/i.test(new TextDecoder().decode(head))) return parseAscii(buffer)
    throw new StlError(
      'not-stl',
      'This file does not look like an STL.',
      'It is text that does not start with the word solid, so it may be OBJ or another format.',
      'Export the part as STL (binary or ASCII) and load that file.',
    )
  }

  if (size < HEADER_BYTES) {
    throw new StlError(
      'too-short',
      `The file is only ${size} bytes long.`,
      'A binary STL needs an 84 byte header, so this cannot be a complete STL file.',
      'Check that the upload or export finished, or export the part again.',
    )
  }
  const expected = HEADER_BYTES + RECORD_BYTES * declared
  throw new StlError(
    'size-mismatch',
    'The file size does not match a binary STL.',
    `The header declares ${declared} triangles, which needs ${expected} bytes, but the file has ${size} bytes. The file is probably truncated or is not an STL.`,
    REEXPORT,
  )
}

function parseBinary(buffer: ArrayBuffer, count: number): RawMesh {
  if (count === 0) throw noTriangles()
  const view = new DataView(buffer)
  const positions = new Float32Array(count * 9)
  for (let t = 0; t < count; t++) {
    // Skip the 12 byte stored normal: normals are recomputed from winding later.
    const record = HEADER_BYTES + RECORD_BYTES * t + 12
    for (let i = 0; i < 9; i++) {
      const value = view.getFloat32(record + 4 * i, true)
      if (!Number.isFinite(value)) throw notFinite(t + 1)
      positions[t * 9 + i] = value
    }
  }
  return { positions, triangleCount: count }
}

function parseAscii(buffer: ArrayBuffer): RawMesh {
  const text = new TextDecoder().decode(buffer)
  let positions = new Float32Array(9 * 1024)
  let cursor = 0
  let facets = 0
  let verticesInFacet = 0

  // Start after the "solid <name>" line so a part named "facet" cannot be read as one.
  const pattern = /\b(facet|vertex)\b[ \t]*([^\r\n]*)/gi
  pattern.lastIndex = Math.max(0, text.indexOf('\n') + 1)
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match[1]!.toLowerCase() === 'facet') {
      if (verticesInFacet !== 0 && verticesInFacet !== 3) throw badAscii(facets)
      facets++
      verticesInFacet = 0
      continue
    }
    const numbers = match[2]!.trim().split(/\s+/)
    if (facets === 0 || verticesInFacet === 3 || numbers.length < 3) throw badAscii(Math.max(facets, 1))
    verticesInFacet++
    if (cursor + 3 > positions.length) {
      const grown = new Float32Array(positions.length * 2)
      grown.set(positions)
      positions = grown
    }
    for (let i = 0; i < 3; i++) {
      const value = Number(numbers[i])
      if (!Number.isFinite(value)) throw notFinite(facets)
      positions[cursor++] = value
    }
  }
  if (verticesInFacet !== 0 && verticesInFacet !== 3) throw badAscii(facets)
  if (cursor === 0) throw noTriangles()
  return { positions: positions.slice(0, cursor), triangleCount: cursor / 9 }
}
