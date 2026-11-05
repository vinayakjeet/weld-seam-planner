import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FIELD_MARKERS, fieldRows, renderFieldTable, withFieldTable } from '../src/core/job/fieldDocs'
import { renderJobSchema } from '../src/core/job/jsonSchema'

const FILE = fileURLToPath(new URL('../README.md', import.meta.url))
const current = readFileSync(FILE, 'utf8')
const next = withFieldTable(current, renderFieldTable(fieldRows(JSON.parse(renderJobSchema()) as object)))

if (next === null) {
  console.error(`README.md has no job field table: it needs ${FIELD_MARKERS.start} followed by ${FIELD_MARKERS.end}. Add both lines where the table belongs, then run npm run fields.`)
  process.exit(1)
}
if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('The job field table in README.md is out of date. Run npm run fields and commit README.md.')
    process.exit(1)
  }
} else {
  writeFileSync(FILE, next)
  console.log('wrote the job field table in README.md')
}
