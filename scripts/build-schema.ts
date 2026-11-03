import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderJobSchema } from '../src/core/job/jsonSchema'

const FILE = fileURLToPath(new URL('../public/schema/weld-job-1.0.json', import.meta.url))
const text = renderJobSchema()

if (process.argv.includes('--check')) {
  if (!existsSync(FILE) || readFileSync(FILE, 'utf8') !== text) {
    console.error('public/schema/weld-job-1.0.json is out of date. Run npm run schema and commit the file.')
    process.exit(1)
  }
} else {
  writeFileSync(FILE, text)
  console.log('wrote public/schema/weld-job-1.0.json')
}
