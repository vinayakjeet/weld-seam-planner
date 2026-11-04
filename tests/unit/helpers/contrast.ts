import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16) / 255))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

// WCAG 2.x contrast ratio between two #RRGGBB colours.
export function contrast(hexA: string, hexB: string): number {
  const [a, b] = [luminance(hexA), luminance(hexB)].sort((x, y) => y - x)
  return (a! + 0.05) / (b! + 0.05)
}

export const TOKENS_FILE = fileURLToPath(new URL('../../../src/styles/tokens.css', import.meta.url))

export function readTokens(file = TOKENS_FILE): Record<string, string> {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const root = css.slice(css.indexOf(':root'))
  const tokens: Record<string, string> = {}
  for (const m of root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]!] = m[2]!.trim()
  return tokens
}

// Follows var() references until a literal value is reached.
export function resolveToken(tokens: Record<string, string>, name: string): string {
  let value = tokens[name]
  for (let i = 0; i < 10 && value !== undefined; i++) {
    const ref = /^var\((--[\w-]+)\)$/.exec(value)
    if (!ref) return value
    value = tokens[ref[1]!]
  }
  throw new Error(`Token ${name} does not resolve to a literal value.`)
}
