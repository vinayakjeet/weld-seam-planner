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

  // WebKit checks a worker's own response against the page's embedder policy, and on a reload that response is a 304.
  it('sends the pair on a 304 from the dev server too, so a reloaded page can still start its worker', async () => {
    const { createServer } = await import('vite')
    const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { port: 0, strictPort: false } })
    await server.listen()
    try {
      const url = `${server.resolvedUrls!.local[0]!.replace(/\/$/, '')}/favicon.svg`
      const first = await fetch(url)
      const etag = first.headers.get('etag')
      expect(etag).not.toBeNull()
      const again = await fetch(url, { headers: { 'If-None-Match': etag! } })
      expect(again.status).toBe(304)
      for (const [key, value] of Object.entries(ISOLATION_HEADERS)) expect(again.headers.get(key), key).toBe(value)
    } finally {
      await server.close()
    }
  }, 30_000)

  it('sends the same pair from vercel.json for every path', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig
    const all = config.headers?.find((rule) => rule.source === '/(.*)')
    expect(all, 'a rule for every path').toBeDefined()
    const sent = Object.fromEntries(all!.headers.map((h) => [h.key, h.value]))
    for (const [key, value] of Object.entries(ISOLATION_HEADERS)) expect(sent[key], key).toBe(value)
  })
})
