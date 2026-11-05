import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ISOLATION_HEADERS } from '../../../scripts/isolationHeaders'

interface VercelConfig {
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
}

describe('cross-origin isolation headers', () => {
  it('asks for same-origin opener and require-corp embedder policies', () => {
    expect(ISOLATION_HEADERS).toEqual({
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    })
  })

  it('sends the same pair from vercel.json for every path', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig
    const all = config.headers?.find((rule) => rule.source === '/(.*)')
    expect(all, 'a rule for every path').toBeDefined()
    const sent = Object.fromEntries(all!.headers.map((h) => [h.key, h.value]))
    for (const [key, value] of Object.entries(ISOLATION_HEADERS)) expect(sent[key], key).toBe(value)
  })
})
