import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { checkEntryChunk, ENTRY_LIMIT_BYTES } from './bundleBudget'

const dist = 'dist'
const entry = checkEntryChunk(dist)
const assets = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'))
for (const f of assets) console.log(`${f}: ${statSync(join(dist, 'assets', f)).size} bytes`)
console.log(`entry ${entry.file}: ${entry.bytes} bytes (limit ${ENTRY_LIMIT_BYTES})`)
if (!entry.ok) {
  console.error(`The entry chunk is ${entry.bytes} bytes, over the ${ENTRY_LIMIT_BYTES} byte budget. Move the heaviest static import behind a dynamic import() or into a named chunk in vite.config.ts.`)
  process.exit(1)
}
