import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const ENTRY_LIMIT_BYTES = 500_000

export interface EntryCheck {
  file: string
  bytes: number
  ok: boolean
}

// The entry chunk is the module script that dist/index.html loads first; lazy chunks do not count against the budget.
export function checkEntryChunk(distDir: string): EntryCheck {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8')
  const match = /<script[^>]*type="module"[^>]*src="\/?([^"]+)"/.exec(html)
  const file = match?.[1]
  if (file === undefined) {
    throw new Error(`dist/index.html has no module script, so there is no entry chunk to measure. Run npm run build and check that Vite wrote the page.`)
  }
  const path = join(distDir, file)
  if (!existsSync(path)) {
    throw new Error(`dist/index.html names ${file} as the entry chunk but that file is not in ${distDir}. Run npm run build again.`)
  }
  const bytes = statSync(path).size
  return { file, bytes, ok: bytes < ENTRY_LIMIT_BYTES }
}
