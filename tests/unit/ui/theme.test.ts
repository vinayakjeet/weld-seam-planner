import { describe, expect, it } from 'vitest'
import { applyTheme, nextTheme, parseTheme, readStoredTheme, THEME_KEY, themeLabel, writeStoredTheme, type ThemeStorage } from '../../../src/ui/shell/theme'

function memory(initial: Record<string, string> = {}): ThemeStorage & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
  }
}

const throwing: ThemeStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('parseTheme', () => {
  it('accepts the two theme names and nothing else', () => {
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme('light')).toBe('light')
    for (const bad of [null, undefined, '', 'Light', 'auto', 'sepia', '1']) expect(parseTheme(bad)).toBeNull()
  })
})

describe('nextTheme', () => {
  it('switches between the two', () => {
    expect(nextTheme('dark')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
  })
})

describe('themeLabel', () => {
  it('names the theme the button switches to', () => {
    expect(themeLabel('dark')).toBe('Switch to the light theme')
    expect(themeLabel('light')).toBe('Switch to the dark theme')
  })
})

describe('stored theme', () => {
  it('starts dark when nothing is stored or the value is not a theme', () => {
    expect(readStoredTheme(memory())).toBe('dark')
    expect(readStoredTheme(memory({ [THEME_KEY]: 'neon' }))).toBe('dark')
  })

  it('reads back what was written', () => {
    const storage = memory()
    writeStoredTheme('light', storage)
    expect(readStoredTheme(storage)).toBe('light')
  })

  it('falls back to dark and does not throw when storage is blocked or missing', () => {
    expect(readStoredTheme(throwing)).toBe('dark')
    expect(readStoredTheme(null)).toBe('dark')
    expect(() => writeStoredTheme('light', throwing)).not.toThrow()
    expect(() => writeStoredTheme('light', null)).not.toThrow()
  })
})

describe('applyTheme', () => {
  it('sets data-theme on the root, so the token block for that theme applies', () => {
    const root = { dataset: {} as Record<string, string | undefined> }
    applyTheme('light', root)
    expect(root.dataset.theme).toBe('light')
    applyTheme('dark', root)
    expect(root.dataset.theme).toBe('dark')
  })
})
