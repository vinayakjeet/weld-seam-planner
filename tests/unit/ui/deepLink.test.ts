import { describe, expect, it } from 'vitest'
import { parseDeepLink } from '../../../src/ui/shell/deepLink'

describe('parseDeepLink', () => {
  it('finds nothing in an empty address', () => {
    expect(parseDeepLink('')).toEqual({ sample: null, demo: false })
  })

  it('reads the sample id', () => {
    expect(parseDeepLink('?sample=t-joint-merged')).toEqual({ sample: 't-joint-merged', demo: false })
  })

  it('takes the first of several sample values', () => {
    expect(parseDeepLink('?sample=a&sample=b').sample).toBe('a')
  })

  it('reads demo alone without a sample', () => {
    expect(parseDeepLink('?demo=1')).toEqual({ sample: null, demo: true })
  })

  it('treats a blank sample as none and trims the rest', () => {
    expect(parseDeepLink('?sample=%20').sample).toBeNull()
    expect(parseDeepLink('?sample=%20tank-with-manhole%20').sample).toBe('tank-with-manhole')
  })

  it('reads demo only for the value 1', () => {
    expect(parseDeepLink('?demo=true').demo).toBe(false)
    expect(parseDeepLink('?demo=0').demo).toBe(false)
    expect(parseDeepLink('?demo=').demo).toBe(false)
    expect(parseDeepLink('?sample=tank-with-manhole&demo=1')).toEqual({ sample: 'tank-with-manhole', demo: true })
  })

  it('keeps a path-like id as plain text for the caller to refuse', () => {
    expect(parseDeepLink('?sample=..%2F..%2Fx').sample).toBe('../../x')
  })
})
