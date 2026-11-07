import { describe, expect, it } from 'vitest'
import { savedOnText } from '../../../src/ui/shell/restoreText'

describe('savedOnText', () => {
  const savedAt = '2026-11-07T07:36:34.000Z'

  it('names the month, so 7 November cannot be read as 11 July, and leaves out the seconds', () => {
    expect(savedOnText(savedAt, 'en-US', 'UTC')).toBe('Nov 7, 2026, 7:36 AM')
    expect(savedOnText(savedAt, 'en-GB', 'UTC')).toBe('7 Nov 2026, 07:36')
  })

  it('follows the reader locale and time zone when none is given', () => {
    expect(savedOnText(savedAt)).toBe(new Date(savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))
  })
})
