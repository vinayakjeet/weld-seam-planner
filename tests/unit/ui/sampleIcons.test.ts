import { describe, expect, it } from 'vitest'
import { GenericPartIcon, iconForSample } from '../../../src/ui/viewport/SampleIcons'
import { readManifest } from '../helpers/samples'

describe('iconForSample', () => {
  it.each(readManifest().samples.map((s) => s.id))('has its own icon for %s', (id) => {
    expect(iconForSample(id)).not.toBe(GenericPartIcon)
  })

  it('uses the generic icon for a sample it does not know', () => {
    expect(iconForSample('turbine-blade')).toBe(GenericPartIcon)
  })

  it('gives the four T-joint variants the same icon', () => {
    const icons = new Set(['t-joint-merged', 't-joint-assembly', 't-joint-inch', 't-joint-ascii'].map(iconForSample))
    expect(icons.size).toBe(1)
  })
})
