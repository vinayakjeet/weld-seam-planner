import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const viewBoxOf = (name: string) => {
  const svg = readFileSync(fileURLToPath(new URL(`../../../public/brand/${name}`, import.meta.url)), 'utf8')
  return /viewBox="([^"]+)"/.exec(svg)?.[1]
}

describe('top bar logos', () => {
  it('crop the dark theme logo and the light theme logo to the same box, so both draw at the same size', () => {
    const dark = viewBoxOf('armatrix-horizontal-light-sand.svg')
    const light = viewBoxOf('armatrix-horizontal-dark-forest.svg')
    expect(dark).toBe('210.5 174.5 2018 199.2')
    expect(light).toBe(dark)
  })
})
