import { describe, expect, it } from 'vitest'
import { parseStl, StlError, type StlErrorCode } from '../../../src/core/mesh/parseStl'
import { readSample } from '../helpers/samples'
import { makeAsciiStl, makeBinaryStl, TRIANGLES } from '../helpers/stl'

function failure(buffer: ArrayBuffer): StlError {
  try {
    parseStl(buffer)
  } catch (error) {
    if (error instanceof StlError) return error
    throw error
  }
  throw new Error('parseStl accepted a file that should have been rejected')
}

describe('parseStl on valid files', () => {
  it('reads every triangle of a binary sample', () => {
    const buffer = readSample('t-joint-merged')
    const mesh = parseStl(buffer)
    expect(mesh.triangleCount).toBe((buffer.byteLength - 84) / 50)
    expect(mesh.positions).toHaveLength(mesh.triangleCount * 9)
    const first = new DataView(buffer).getFloat32(84 + 12, true)
    expect(mesh.positions[0]).toBe(first)
  })

  it('reads a binary file whose header starts with solid as binary', () => {
    const plain = readSample('t-joint-merged')
    const solidHeader = plain.slice(0)
    new Uint8Array(solidHeader).set(new TextEncoder().encode('solid exported by a CAD tool'), 0)
    expect(parseStl(solidHeader).positions).toEqual(parseStl(plain).positions)
  })

  it('reads the ASCII sample to the same triangles as the binary one', () => {
    const ascii = parseStl(readSample('t-joint-ascii'))
    const binary = parseStl(readSample('t-joint-merged'))
    expect(ascii.triangleCount).toBe(binary.triangleCount)
    ascii.positions.forEach((value, i) => expect(value).toBeCloseTo(binary.positions[i]!, 3))
  })

  it('reads ASCII with Windows line endings', () => {
    const mesh = parseStl(makeAsciiStl(TRIANGLES, { eol: '\r\n' }))
    expect(mesh.triangleCount).toBe(TRIANGLES.length)
    expect(Array.from(mesh.positions.slice(0, 9))).toEqual(TRIANGLES[0])
  })

  it('reads ASCII with upper case keywords', () => {
    expect(parseStl(makeAsciiStl(TRIANGLES, { upper: true })).triangleCount).toBe(TRIANGLES.length)
  })

  it('reads ASCII numbers in exponent notation', () => {
    const text = 'solid x\nfacet normal 0 0 1\nouter loop\nvertex 1.5e+02 -2E-1 0\nvertex 0 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid x\n'
    const mesh = parseStl(new TextEncoder().encode(text).buffer as ArrayBuffer)
    expect(Array.from(mesh.positions.slice(0, 2))).toEqual([150, -0.2].map(Math.fround))
  })
})

describe('parseStl on bad files', () => {
  const ascii = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

  const cases: [string, () => ArrayBuffer, StlErrorCode][] = [
    ['an empty file', () => new ArrayBuffer(0), 'empty'],
    ['10 bytes', () => new ArrayBuffer(10), 'too-short'],
    ['a truncated binary file', () => readSample('t-joint-merged').slice(0, 1874), 'size-mismatch'],
    [
      'a truncated binary file with a solid header',
      () => {
        const truncated = readSample('t-joint-merged').slice(0, 1874)
        new Uint8Array(truncated).set(new TextEncoder().encode('solid cad'), 0)
        return truncated
      },
      'size-mismatch',
    ],
    ['random bytes', () => Uint8Array.from({ length: 300 }, (_, i) => (i * 37) % 256).buffer, 'size-mismatch'],
    ['a binary header with zero triangles', () => makeBinaryStl([]), 'no-triangles'],
    ['an ASCII solid with no facets', () => ascii('solid x\nendsolid x\n'), 'no-triangles'],
    ['an OBJ file renamed to .stl', () => ascii('# cube\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'), 'not-stl'],
    ['a facet with only two vertices', () => ascii('solid x\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nendloop\nendfacet\nendsolid x\n'), 'not-stl'],
    ['NaN in a binary triangle', () => makeBinaryStl([...TRIANGLES.slice(0, 3), [0, 0, 0, Number.NaN, 0, 0, 0, 1, 0]]), 'non-finite'],
    ['Infinity in a binary triangle', () => makeBinaryStl([[0, 0, 0, Number.POSITIVE_INFINITY, 0, 0, 0, 1, 0]]), 'non-finite'],
    ['nan in an ASCII vertex', () => ascii('solid x\nfacet normal 0 0 1\nouter loop\nvertex nan 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid x\n'), 'non-finite'],
  ]

  it.each(cases)('rejects %s with code %s', (_name, build, code) => {
    expect(failure(build()).code).toBe(code)
  })

  it.each(cases)('explains %s in three parts without dashes', (_name, build) => {
    const error = failure(build())
    expect(error).toBeInstanceOf(Error)
    for (const part of [error.what, error.why, error.next]) expect(part.length).toBeGreaterThan(0)
    expect(error.message).toBe(`${error.what} ${error.why} ${error.next}`)
    expect(error.message).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`))
  })

  it('names both the expected and the actual size of a truncated binary file', () => {
    const buffer = readSample('t-joint-merged')
    const error = failure(buffer.slice(0, 1874))
    const declared = new DataView(buffer).getUint32(80, true)
    expect(error.message).toContain(String(84 + 50 * declared))
    expect(error.message).toContain('1874')
  })

  it('names the triangle that holds the NaN', () => {
    const error = failure(makeBinaryStl([...TRIANGLES.slice(0, 3), [0, 0, 0, Number.NaN, 0, 0, 0, 1, 0]]))
    expect(error.message).toContain('Triangle 4')
  })
})
