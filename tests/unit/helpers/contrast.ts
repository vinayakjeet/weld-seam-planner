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

export type ThemeName = 'dark' | 'light'

const LIGHT_BLOCK = /:root\[data-theme='light'\]\s*\{([^}]*)\}/

function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim()
  return out
}

// The dark theme is the :root block; the light theme is that block with the :root[data-theme='light'] overrides on top.
export function readTokens(file = TOKENS_FILE, theme: ThemeName = 'dark'): Record<string, string> {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const light = LIGHT_BLOCK.exec(css)
  const dark = declarations(css.slice(css.indexOf(':root'), light ? light.index : undefined))
  return theme === 'light' ? { ...dark, ...declarations(light?.[1] ?? '') } : dark
}

// Only the names the light theme overrides.
export function readLightOverrides(file = TOKENS_FILE): Record<string, string> {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  return declarations(LIGHT_BLOCK.exec(css)?.[1] ?? '')
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
