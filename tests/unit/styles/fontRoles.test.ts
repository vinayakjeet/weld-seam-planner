import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const ui = fileURLToPath(new URL('../../../src/ui', import.meta.url))

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

it('uses the display font only for the title, the empty-state headline and the panel heading', () => {
  const users = filesUnder(ui)
    .filter((f) => f.endsWith('.tsx') && /\bfont-display\b/.test(readFileSync(f, 'utf8')))
    .map((f) => f.slice(ui.length + 1))
    .sort()
  expect(users).toEqual(['kit/PanelHeading.tsx', 'shell/TopBar.tsx', 'viewport/EmptyState.tsx'])
})
