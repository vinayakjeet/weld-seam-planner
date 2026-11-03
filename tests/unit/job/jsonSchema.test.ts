import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderJobSchema } from '../../../src/core/job/jsonSchema'
import { SCHEMA_URL } from '../../../src/core/job/schema'

const FILE = fileURLToPath(new URL('../../../public/schema/weld-job-1.0.json', import.meta.url))
const rendered: unknown = JSON.parse(renderJobSchema())

function at(...path: Array<string | number>): unknown {
  let node = rendered
  for (const key of path) node = (node as Record<string | number, unknown>)[key]
  return node
}

describe('renderJobSchema', () => {
  it('is a 2020-12 schema with the app id and a title', () => {
    expect(at('$schema')).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(at('$id')).toBe(SCHEMA_URL)
    expect(typeof at('title')).toBe('string')
  })

  it('requires the top level keys', () => {
    expect(at('required')).toEqual(
      expect.arrayContaining(['format', 'version', 'id', 'createdAt', 'generator', 'units', 'frames', 'part', 'settings', 'procedures', 'seams', 'sequence', 'access', 'summary', 'validation']),
    )
  })

  it('describes a quaternion as 4 prefix items, the fourth at least 0', () => {
    const q = ['properties', 'seams', 'items', 'properties', 'poses', 'items', 'properties', 'quaternion'] as const
    expect(at(...q, 'type')).toBe('array')
    expect(at(...q, 'prefixItems')).toHaveLength(4)
    expect(at(...q, 'prefixItems', 3, 'minimum')).toBe(0)
  })

  it('forces empty validation.errors', () => {
    expect(at('properties', 'validation', 'properties', 'errors', 'maxItems')).toBe(0)
  })

  it('ends with a newline, indents 2 spaces and equals the committed file byte for byte', () => {
    const text = renderJobSchema()
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).toContain('\n  "$schema"')
    expect(readFileSync(FILE, 'utf8')).toBe(text)
  })
})
