import { describe, expect, it } from 'vitest'
import { sampleManifestSchema } from '../../../src/core/samples/manifest'
import { readManifest, readSample } from '../helpers/samples'

const IDS = [
  't-joint-merged',
  't-joint-assembly',
  't-joint-inch',
  't-joint-ascii',
  'l-bracket-gussets',
  'box-beam',
  'pipe-on-plate',
  'double-bottom-cell',
  'bar-through-plate',
  'flipped-normals',
]

const entry = {
  id: 'a',
  file: 'a.stl',
  name: 'A',
  description: 'a part',
  units: 'mm',
  bodies: 1,
  expectedCreaseSeams: 0,
}

describe('sampleManifestSchema', () => {
  it('accepts a minimal valid manifest', () => {
    expect(sampleManifestSchema.safeParse({ version: 1, samples: [entry] }).success).toBe(true)
  })

  it('rejects units other than mm and in', () => {
    const bad = { version: 1, samples: [{ ...entry, units: 'cm' }] }
    expect(sampleManifestSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a negative expected seam count', () => {
    const bad = { version: 1, samples: [{ ...entry, expectedCreaseSeams: -1 }] }
    expect(sampleManifestSchema.safeParse(bad).success).toBe(false)
  })

  it('defaults the contact and intersection counts to 0', () => {
    const parsed = sampleManifestSchema.parse({ version: 1, samples: [entry] })
    expect([parsed.samples[0]!.expectedContactSeams, parsed.samples[0]!.expectedIntersectionSeams]).toEqual([0, 0])
  })

  it('rejects a negative expected contact or intersection count', () => {
    for (const field of ['expectedContactSeams', 'expectedIntersectionSeams']) {
      const bad = { version: 1, samples: [{ ...entry, [field]: -1 }] }
      expect(sampleManifestSchema.safeParse(bad).success, field).toBe(false)
    }
  })

  it('rejects duplicate ids', () => {
    const bad = { version: 1, samples: [entry, { ...entry, file: 'b.stl' }] }
    expect(sampleManifestSchema.safeParse(bad).success).toBe(false)
  })
})

describe('public/samples', () => {
  const manifest = readManifest()
  const byId = new Map(manifest.samples.map((s) => [s.id, s]))

  it('lists the ten samples once each', () => {
    expect(manifest.samples.map((s) => s.id).sort()).toEqual([...IDS].sort())
  })

  it('has a non-empty file named after each id', () => {
    for (const s of manifest.samples) {
      expect(s.file).toBe(`${s.id}.stl`)
      expect(readSample(s.id).byteLength).toBeGreaterThan(84)
    }
  })

  it('stores every sample but the ASCII one as binary STL by the size formula', () => {
    for (const id of IDS.filter((i) => i !== 't-joint-ascii')) {
      const buffer = readSample(id)
      const count = new DataView(buffer).getUint32(80, true)
      expect(buffer.byteLength, id).toBe(84 + 50 * count)
      expect(new TextDecoder().decode(buffer.slice(0, 5)), id).not.toBe('solid')
    }
  })

  it('stores t-joint-ascii as ASCII text', () => {
    const text = new TextDecoder().decode(readSample('t-joint-ascii'))
    expect(text.startsWith('solid')).toBe(true)
    expect(text).toContain('facet normal')
  })

  it('declares t-joint-inch in inches and the rest in millimetres', () => {
    expect(byId.get('t-joint-inch')?.units).toBe('in')
    expect(manifest.samples.filter((s) => s.units === 'mm')).toHaveLength(9)
  })

  it('describes box-beam as the welded box girder', () => {
    const girder = byId.get('box-beam')
    expect(girder?.name).toBe('Box girder')
    expect(girder?.description).toBe(
      'Welded box girder: 4 outside fillets, 4 inside corners only reachable from the open ends',
    )
  })

  it('records the hand-derived contact counts', () => {
    const contact = Object.fromEntries(manifest.samples.map((s) => [s.id, s.expectedContactSeams]))
    expect(contact).toMatchObject({
      't-joint-merged': 0,
      't-joint-assembly': 2,
      't-joint-inch': 0,
      't-joint-ascii': 0,
      'l-bracket-gussets': 0,
      'box-beam': 0,
      'pipe-on-plate': 0,
      'double-bottom-cell': 50,
    })
  })

  it('records the hand-derived intersection counts and the bar sample label', () => {
    const intersections = Object.fromEntries(manifest.samples.map((s) => [s.id, s.expectedIntersectionSeams]))
    expect(intersections['bar-through-plate']).toBe(2)
    expect(Object.entries(intersections).filter(([id]) => id !== 'bar-through-plate').every(([, n]) => n === 0)).toBe(true)
    expect(byId.get('bar-through-plate')?.name).toBe('Bar through plate')
    expect(byId.get('bar-through-plate')?.units).toBe('mm')
    expect(byId.get('flipped-normals')?.name).toBe('Flipped normals')
  })

  it('no longer says contact detection is missing', () => {
    expect(byId.get('t-joint-assembly')?.description).not.toMatch(/until contact detection exists/)
    expect(byId.get('double-bottom-cell')?.description).not.toMatch(/need contact detection/)
  })

  it('records the hand-derived crease counts and body counts', () => {
    const expected: Record<string, [number, number]> = {
      't-joint-merged': [1, 2],
      't-joint-assembly': [2, 0],
      't-joint-inch': [1, 2],
      't-joint-ascii': [1, 2],
      'l-bracket-gussets': [1, 16],
      'box-beam': [1, 8],
      'pipe-on-plate': [1, 2],
      'double-bottom-cell': [7, 6],
      'bar-through-plate': [2, 0],
      'flipped-normals': [2, 4],
    }
    for (const [id, [bodies, seams]] of Object.entries(expected)) {
      expect([byId.get(id)?.bodies, byId.get(id)?.expectedCreaseSeams], id).toEqual([bodies, seams])
    }
  })
})
