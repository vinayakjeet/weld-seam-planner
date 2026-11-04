import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrast, readTokens, resolveToken } from '../helpers/contrast'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const tokens = readTokens()
const hex = (name: string) => resolveToken(tokens, name)

// Names that existed before the brand pack was merged; other code and Tailwind depend on them.
const KEPT = [
  '--brand-primary', '--brand-secondary', '--brand-font-display', '--brand-font-ui',
  '--bg-0', '--bg-1', '--bg-2', '--line', '--text-0', '--text-1', '--text-2',
  '--viewport-bg', '--part', '--part-edge', '--seam-candidate', '--seam-accepted', '--seam-hover',
  '--access-standard', '--access-slim', '--access-snake', '--access-blocked',
  '--reach-ok', '--reach-miss', '--ok', '--warn', '--err', '--info', '--scroll-thumb', '--scroll-track', '--num',
]

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

describe('brand tokens', () => {
  it('keeps every token name that existed before the pack', () => {
    for (const name of KEPT) expect(tokens[name], name).toBeDefined()
  })

  it('adds the accent, halo and on-colour tokens', () => {
    for (const name of ['--brand-accent', '--on-accent', '--on-primary', '--brand-primary-fill', '--halo', '--bg-3']) expect(tokens[name], name).toBeDefined()
  })

  it('has merged and removed brand-tokens.css', () => {
    expect(existsSync(`${root}src/styles/brand-tokens.css`)).toBe(false)
  })

  it('no longer mentions JetBrains in source or ships its font', () => {
    const offenders = filesUnder(`${root}src`).filter((f) => !/\.(woff2|txt)$/.test(f) && /jetbrains/i.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
    expect(readdirSync(`${root}src/styles/fonts`).filter((f) => /jetbrains/i.test(f))).toEqual([])
  })

  it('uses Onest for the UI and Redaction for display, each with a fallback stack', () => {
    expect(tokens['--brand-font-ui']).toMatch(/^'Onest', .*(sans-serif)$/)
    expect(tokens['--brand-font-display']).toMatch(/^'Redaction', .*serif$/)
  })

  it('keeps text readable on the accent and on the primary fill', () => {
    expect(contrast(hex('--brand-accent'), hex('--on-accent'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hex('--brand-primary-fill'), hex('--on-primary'))).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the focus ring visible on every surface', () => {
    for (const surface of ['--bg-0', '--bg-1', '--bg-2']) expect(contrast(hex('--brand-primary'), hex(surface)), surface).toBeGreaterThanOrEqual(3)
  })

  it('keeps body text readable on every surface', () => {
    for (const surface of ['--bg-0', '--bg-1', '--bg-2']) {
      expect(contrast(hex('--text-0'), hex(surface)), `text-0 on ${surface}`).toBeGreaterThanOrEqual(7)
      expect(contrast(hex('--text-1'), hex(surface)), `text-1 on ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
