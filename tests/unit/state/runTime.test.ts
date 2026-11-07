import { describe, expect, it } from 'vitest'
import { runTimeText } from '../../../src/state/runTime'

describe('runTimeText', () => {
  it('writes a run of a tenth of a second or more in seconds with one decimal', () => {
    expect(runTimeText(100)).toBe('0.1 s')
    expect(runTimeText(2345)).toBe('2.3 s')
  })

  it('writes a run under a tenth of a second as under 0.1 s, never 0.0 s', () => {
    expect(runTimeText(0)).toBe('under 0.1 s')
    expect(runTimeText(12)).toBe('under 0.1 s')
    expect(runTimeText(99.9)).toBe('under 0.1 s')
  })
})
