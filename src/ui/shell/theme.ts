export type Theme = 'dark' | 'light'

export const THEME_KEY = 'weld-seam-planner.theme'

export interface ThemeStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function parseTheme(value: string | null | undefined): Theme | null {
  return value === 'dark' || value === 'light' ? value : null
}

export const nextTheme = (theme: Theme): Theme => (theme === 'dark' ? 'light' : 'dark')

export const themeLabel = (theme: Theme): string => `Switch to the ${nextTheme(theme)} theme`

// Storage is a convenience: it can be blocked or missing, and the app then starts dark.
export function readStoredTheme(storage: ThemeStorage | null): Theme {
  try {
    return parseTheme(storage?.getItem(THEME_KEY)) ?? 'dark'
  } catch {
    return 'dark'
  }
}

export function writeStoredTheme(theme: Theme, storage: ThemeStorage | null): void {
  try {
    storage?.setItem(THEME_KEY, theme)
  } catch {
    // The choice then lasts until the page closes.
  }
}

export function applyTheme(theme: Theme, root: { dataset: Record<string, string | undefined> }): void {
  root.dataset.theme = theme
}

function browserStorage(): ThemeStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// Runs once before the first render, so the page never paints in the wrong theme.
export function startTheme(): Theme {
  const theme = readStoredTheme(browserStorage())
  applyTheme(theme, document.documentElement)
  return theme
}

// The order matters: the document attribute changes first, so the viewport reads the new token values when the store update re-renders it.
export function chooseTheme(theme: Theme, setStoreTheme: (theme: Theme) => void): void {
  applyTheme(theme, document.documentElement)
  writeStoredTheme(theme, browserStorage())
  setStoreTheme(theme)
}
