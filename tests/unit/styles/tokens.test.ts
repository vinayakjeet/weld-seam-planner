import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrast, readLightOverrides, readTokens, resolveToken } from '../helpers/contrast'

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

describe('light theme', () => {
  const light = readTokens(undefined, 'light')
  const lightHex = (name: string) => resolveToken(light, name)
  const overrides = readLightOverrides()

  it('overrides only names the dark theme defines', () => {
    for (const name of Object.keys(overrides)) expect(tokens[name], name).toBeDefined()
  })

  it('is built from the brand palette: every surface, line, text and brand override points at a palette token', () => {
    for (const name of ['--bg-0', '--bg-1', '--bg-2', '--bg-3', '--line', '--text-0', '--text-1', '--text-2', '--brand-primary']) {
      expect(overrides[name], name).toMatch(/^var\(--(dark-forest|light-sand|revolution-green|bright-discovery)[\w-]*\)$/)
    }
  })

  it('moves the surfaces from dark to light', () => {
    for (const surface of ['--bg-0', '--bg-1', '--bg-2']) expect(contrast(lightHex(surface), hex('--bg-0'))).toBeGreaterThan(8)
    expect(contrast(lightHex('--text-0'), lightHex('--bg-0'))).toBeGreaterThan(15)
  })

  it('keeps body text readable on every surface', () => {
    for (const surface of ['--bg-0', '--bg-1', '--bg-2']) {
      expect(contrast(lightHex('--text-0'), lightHex(surface)), `text-0 on ${surface}`).toBeGreaterThanOrEqual(7)
      expect(contrast(lightHex('--text-1'), lightHex(surface)), `text-1 on ${surface}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(lightHex('--text-2'), lightHex(surface)), `text-2 on ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps status text readable on every surface', () => {
    for (const status of ['--ok', '--warn', '--err', '--info']) {
      for (const surface of ['--bg-0', '--bg-1', '--bg-2']) {
        expect(contrast(lightHex(status), lightHex(surface)), `${status} on ${surface}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('keeps the focus ring visible on every surface', () => {
    for (const surface of ['--bg-0', '--bg-1', '--bg-2']) expect(contrast(lightHex('--brand-primary'), lightHex(surface)), surface).toBeGreaterThanOrEqual(3)
  })

  it('keeps text readable on the accent and on the primary fill', () => {
    expect(contrast(lightHex('--brand-accent'), lightHex('--on-accent'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(lightHex('--brand-primary-fill'), lightHex('--on-primary'))).toBeGreaterThanOrEqual(4.5)
  })

  it('draws the part against the viewport with at least 3 to 1', () => {
    expect(contrast(lightHex('--part'), lightHex('--viewport-bg'))).toBeGreaterThanOrEqual(3)
  })
})

describe('scene colours', () => {
  const light = readTokens(undefined, 'light')

  it('are the same in both themes, because seams are read against the part and a dark halo, not against the page', () => {
    for (const name of [
      '--part', '--part-edge', '--seam-candidate', '--seam-accepted', '--seam-hover', '--halo', '--scene-select', '--scene-warn',
      '--scene-reject', '--access-standard', '--access-slim', '--access-snake', '--access-blocked', '--reach-ok', '--reach-miss',
    ]) {
      expect(tokens[name], name).toBeDefined()
      expect(resolveToken(light, name), name).toBe(hex(name))
    }
  })

  it('stand out from the part with at least 3 to 1 once the halo is counted', () => {
    for (const name of ['--seam-candidate', '--seam-accepted', '--access-standard', '--access-slim', '--access-snake', '--access-blocked']) {
      expect(contrast(hex(name), hex('--halo')), name).toBeGreaterThanOrEqual(3)
    }
  })
})
