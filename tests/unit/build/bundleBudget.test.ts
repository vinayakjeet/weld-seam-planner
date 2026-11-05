import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkEntryChunk, ENTRY_LIMIT_BYTES } from '../../../scripts/bundleBudget'

const made: string[] = []

function fakeDist(entryBytes: number | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'dist-'))
  made.push(dir)
  mkdirSync(join(dir, 'assets'))
  writeFileSync(
    join(dir, 'index.html'),
    '<html><head><link rel="stylesheet" href="/assets/index-x.css"><script type="module" crossorigin src="/assets/index-x.js"></script></head></html>',
  )
  if (entryBytes !== null) writeFileSync(join(dir, 'assets', 'index-x.js'), Buffer.alloc(entryBytes))
  return dir
}

afterEach(() => {
  while (made.length > 0) rmSync(made.pop() as string, { recursive: true, force: true })
})

describe('checkEntryChunk', () => {
  it('uses a 500 kB budget', () => {
    expect(ENTRY_LIMIT_BYTES).toBe(500_000)
  })

  it('passes a chunk just under the limit', () => {
    const result = checkEntryChunk(fakeDist(499_999))
    expect(result).toEqual({ file: 'assets/index-x.js', bytes: 499_999, ok: true })
  })

  it('fails a chunk just over the limit', () => {
    const result = checkEntryChunk(fakeDist(500_001))
    expect(result.ok).toBe(false)
    expect(result.bytes).toBe(500_001)
  })

  it('names the expected file when the entry is missing', () => {
    expect(() => checkEntryChunk(fakeDist(null))).toThrow(/assets\/index-x\.js/)
  })

  it('says what is wrong when index.html names no script', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dist-'))
    made.push(dir)
    writeFileSync(join(dir, 'index.html'), '<html></html>')
    expect(() => checkEntryChunk(dir)).toThrow(/no module script/)
  })
})
