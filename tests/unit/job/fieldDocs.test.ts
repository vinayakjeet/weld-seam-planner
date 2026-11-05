import { describe, expect, it } from 'vitest'
import { FIELD_MARKERS, fieldRows, renderFieldTable, withFieldTable } from '../../../src/core/job/fieldDocs'
import { renderJobSchema } from '../../../src/core/job/jsonSchema'

const schema = JSON.parse(renderJobSchema()) as object
const rows = fieldRows(schema)
const byPath = new Map(rows.map((row) => [row.path, row]))
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

describe('fieldRows', () => {
  it('describes every field', () => {
    const missing = rows.filter((row) => row.description.trim() === '').map((row) => row.path)
    expect(missing).toEqual([])
  })

  it('flattens arrays with [] and nests objects with dots', () => {
    for (const path of ['seams[].access.class', 'sequence.order[].reversed', 'access.ports[].diameterMm', 'seams[].geometry.start', 'seams[].poses[].quaternion']) {
      expect(byPath.has(path), path).toBe(true)
    }
  })

  it('keeps schema order, a parent before its children', () => {
    const paths = rows.map((row) => row.path)
    expect(paths.slice(0, 4)).toEqual(['$schema', 'format', 'version', 'id'])
    expect(paths.indexOf('seams')).toBeLessThan(paths.indexOf('seams[].id'))
    expect(paths.indexOf('seams[].poses')).toBeLessThan(paths.indexOf('seams[].poses[].s'))
    expect(paths.indexOf('sequence')).toBeLessThan(paths.indexOf('access'))
  })

  it('reads required from the parent, and a field with a default is optional to a reader', () => {
    expect(byPath.get('seams[].id')!.required).toBe(true)
    expect(byPath.get('settings.cleanEveryS')!.required).toBe(false)
    expect(byPath.get('settings.weldToleranceRel')!.required).toBe(false)
    expect(byPath.get('seams[].access.nearClearanceDeg')!.required).toBe(false)
  })

  it('names the types a consumer reads', () => {
    expect(byPath.get('seams[].poses[].quaternion')!.type).toBe('number[4]')
    expect(byPath.get('seams[].geometry.start')!.type).toBe('number[3]')
    expect(byPath.get('access.arm')!.type).toBe('object or null')
    expect(byPath.get('access.arm.links')!.type).toBe('integer')
    expect(byPath.get('format')!.type).toBe('"weld-job"')
    expect(byPath.get('seams[].access.class')!.type).toBe('"standard", "slim", "snake", "blocked" or null')
    expect(byPath.get('seams[].access.unreachable')!.type).toBe('number[2][]')
    expect(byPath.get('seams')!.type).toBe('object[]')
  })

  it('lists the overrides once and leaves their keys to the procedure rows', () => {
    expect(byPath.has('seams[].overrides')).toBe(true)
    expect(rows.some((row) => row.path.startsWith('seams[].overrides.'))).toBe(false)
    expect(byPath.has('procedures[].electrical.currentA')).toBe(true)
  })

  it('says how reversed relates to the poses', () => {
    expect(byPath.get('sequence.order[].reversed')!.description).toMatch(/poses/)
    expect(byPath.get('seams[].poses')!.description).toMatch(/travel/)
  })

  it('has no en or em dash in any description', () => {
    expect(rows.filter((row) => DASHES.test(row.description)).map((row) => row.path)).toEqual([])
  })
})

describe('withFieldTable', () => {
  const { start, end } = FIELD_MARKERS

  it('replaces only the text between the markers, keeping one blank line inside each', () => {
    const text = `# A\n\n${start}\nold\n${end}\n\nafter\n`
    expect(withFieldTable(text, '| t |\n')).toBe(`# A\n\n${start}\n\n| t |\n\n${end}\n\nafter\n`)
  })

  it('is stable when run again', () => {
    const once = withFieldTable(`${start}${end}`, '| t |\n')!
    expect(withFieldTable(once, '| t |\n')).toBe(once)
  })

  it('returns null when a marker is missing or out of order', () => {
    expect(withFieldTable('no markers', 'x')).toBeNull()
    expect(withFieldTable(`${end}\n${start}`, 'x')).toBeNull()
  })
})

describe('renderFieldTable', () => {
  const table = renderFieldTable(rows)
  const lines = table.trimEnd().split('\n')

  it('has a header, a rule and one line per row', () => {
    expect(lines).toHaveLength(rows.length + 2)
    expect(lines[0]).toBe('| Field | Type | Required | Meaning |')
    expect(lines[1]).toBe('| --- | --- | --- | --- |')
  })

  it('puts each path in code and escapes a pipe so a row keeps four cells', () => {
    const [row] = renderFieldTable([{ path: 'a.b', type: 'string', required: true, description: 'x | y' }]).trimEnd().split('\n').slice(2)
    expect(row).toBe('| `a.b` | string | yes | x \\| y |')
  })
})
