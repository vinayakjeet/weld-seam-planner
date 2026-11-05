import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIELD_MARKERS, fieldRows, renderFieldTable } from '../../../src/core/job/fieldDocs'
import { renderJobSchema } from '../../../src/core/job/jsonSchema'

const README = readFileSync('README.md', 'utf8')
const LIVE = 'https://weld-seam-planner.vercel.app'
const DEMO = 'https://weld-seam-planner.vercel.app/?sample=tank-with-manhole&demo=1'
const AUTHOR = 'Vinayakjeet Singh Karki, f20221641@pilani.bits-pilani.ac.in'

const HEADINGS = [
  'Live demo and deep link',
  'Quick start',
  'The six-step workflow',
  'Who it is for',
  'Architecture and why',
  'Detection pipeline',
  'Torch frame and quaternion convention',
  'Welding maths',
  'Access classes and the snake-arm model',
  'The job JSON',
  'RAPID as a template',
  'Brand usage',
  'Testing',
  'Browser support',
  'Key numbers',
  'Known limits',
  'Next steps',
]

const h2 = README.split('\n').filter((line) => line.startsWith('## ')).map((line) => line.slice(3).trim())

function section(heading: string): string {
  const start = README.indexOf(`\n## ${heading}\n`)
  if (start < 0) return ''
  const next = README.indexOf('\n## ', start + 4)
  return README.slice(start, next < 0 ? undefined : next)
}

describe('README.md', () => {
  it('has the sections in order, and nothing else at the second level', () => {
    expect(h2).toEqual(HEADINGS)
  })

  it('opens with a title, the pitch and the author before the first section', () => {
    const lead = README.slice(0, README.indexOf('\n## '))
    expect(lead.startsWith('# Weld Seam Planner\n')).toBe(true)
    expect(lead).toContain(AUTHOR)
    expect(lead.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#')).join(' ').length).toBeGreaterThan(200)
  })

  it('gives the live URL and puts the demo link in its section', () => {
    expect(README).toContain(LIVE)
    expect(section('Live demo and deep link')).toContain(DEMO)
    expect(section('Live demo and deep link')).toMatch(/demo=1.*only.*tank-with-manhole|only.*tank-with-manhole.*demo=1/s)
  })

  it('names the browsers CI runs and the shared memory probe', () => {
    const text = section('Browser support')
    for (const word of ['Chromium', 'Firefox', 'WebKit', 'SharedArrayBuffer', 'cross-origin isolated']) expect(text).toContain(word)
    expect(text).toMatch(/probe/i)
  })

  it('explains the weld tolerance and its job field', () => {
    const text = section('Detection pipeline')
    expect(text).toContain('weld tolerance')
    expect(text).toContain('settings.weldToleranceRel')
  })

  it('lists the step keys 1 to 6 with the workflow', () => {
    const text = section('The six-step workflow')
    for (const step of ['Import', 'Seams', 'Procedures', 'Access', 'Sequence', 'Export']) expect(text).toContain(step)
    for (const key of ['1', '2', '3', '4', '5', '6']) expect(text).toContain(`| ${key} |`)
  })

  it('has no en dash, em dash or emoji', () => {
    expect(README).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`))
    expect(README).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })

  it('links only to files that exist', () => {
    const targets = [...README.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)].map((m) => m[1]!).filter((t) => !/^[a-z]+:/i.test(t))
    expect(targets).toEqual(expect.arrayContaining(['public/schema/weld-job-1.0.json', 'examples/consume_job.py']))
    expect(targets.filter((t) => !existsSync(t))).toEqual([])
  })

  it('holds the job field table the schema renders', () => {
    const from = README.indexOf(FIELD_MARKERS.start) + FIELD_MARKERS.start.length
    const to = README.indexOf(FIELD_MARKERS.end)
    expect(README.slice(from, to).trim()).toBe(renderFieldTable(fieldRows(JSON.parse(renderJobSchema()) as object)).trim())
    expect(section('The job JSON')).toContain(FIELD_MARKERS.start)
  })
})
