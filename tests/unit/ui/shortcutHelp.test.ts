import { describe, expect, it } from 'vitest'
import { STEPS } from '../../../src/state/store'
import { SHORTCUT_HELP, shortcutFor, shortcutGate, stepForShortcut, type KeyEventLike, type Shortcut } from '../../../src/ui/shell/shortcuts'

function key(k: string, mods: Partial<KeyEventLike> = {}, target: KeyEventLike['target'] = { tagName: 'BODY' }): KeyEventLike {
  return { key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target, ...mods }
}

// What a US keyboard types for Shift and a digit.
const SHIFTED_DIGIT: Record<string, string> = { '1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '^' }
const NAMED: Record<string, string> = { Space: ' ', Delete: 'Delete', Enter: 'Enter', Escape: 'Escape', Backspace: 'Backspace' }

// Reads a row's key label ("Ctrl+Shift+Z", "?", "Space") as the event a browser would send for it.
function eventFor(chord: string): KeyEventLike {
  const parts = chord === '+' ? ['+'] : chord.split('+')
  const last = parts[parts.length - 1]!
  const mods = parts.slice(0, -1)
  const shifted = mods.includes('Shift') && SHIFTED_DIGIT[last] !== undefined
  return key(shifted ? SHIFTED_DIGIT[last]! : (NAMED[last] ?? last), {
    ctrlKey: mods.includes('Ctrl'),
    metaKey: mods.includes('Cmd'),
    shiftKey: mods.includes('Shift') || last === '?',
    ...(/^\d$/.test(last) ? { code: `Digit${last}` } : {}),
  })
}

const ALL: Shortcut[] = [
  'fit', 'undo', 'redo', 'draw', 'split', 'reverse', 'remove', 'play', 'xray', 'finish', 'cancel', 'undoPoint',
  'help', 'view1', 'view2', 'view3', 'view4', 'view5', 'view6', 'accept', 'reject', 'export', 'step1', 'step2', 'step3', 'step4', 'step5', 'step6',
]

describe('SHORTCUT_HELP', () => {
  it('has at least one row for every shortcut', () => {
    for (const id of ALL) expect(SHORTCUT_HELP.filter((row) => row.id === id).length, id).toBeGreaterThan(0)
  })

  it('has only rows whose first key gives back that row id', () => {
    for (const row of SHORTCUT_HELP) {
      expect(row.keys.length, row.id).toBeGreaterThan(0)
      expect(shortcutFor(eventFor(row.keys[0]!)), `${row.id} ${row.keys[0]}`).toBe(row.id)
    }
  })

  it('groups the rows under View, Steps, Tools, Playback, File and History, with a label each', () => {
    expect(new Set(SHORTCUT_HELP.map((row) => row.group))).toEqual(new Set(['View', 'Steps', 'Tools', 'Playback', 'File', 'History']))
    for (const row of SHORTCUT_HELP) expect(row.label.trim().length, row.id).toBeGreaterThan(0)
  })

  it('names the fit and step rows the way the sheet shows them', () => {
    expect(SHORTCUT_HELP.find((row) => row.id === 'fit')!.label).toBe('Fit view')
  })

  it('uses no dash characters', () => {
    const text = JSON.stringify(SHORTCUT_HELP)
    expect(text).not.toMatch(new RegExp('[\\u2013\\u2014]'))
  })
})

describe('help and step keys', () => {
  it('maps ? to help', () => {
    expect(shortcutFor(key('?', { shiftKey: true }))).toBe('help')
  })

  it('maps 1 to 6 to the six steps', () => {
    for (let n = 1; n <= 6; n++) expect(shortcutFor(key(String(n)))).toBe(`step${n}`)
  })

  it('leaves 0, 7 and 9 alone', () => {
    for (const k of ['0', '7', '9']) expect(shortcutFor(key(k))).toBeNull()
  })

  it('leaves browser shortcuts with Ctrl or Cmd and a digit alone', () => {
    expect(shortcutFor(key('1', { ctrlKey: true }))).toBeNull()
    expect(shortcutFor(key('1', { metaKey: true }))).toBeNull()
    expect(shortcutFor(key('?', { ctrlKey: true, shiftKey: true }))).toBeNull()
  })

  it('does not take the shifted digit, which is a symbol', () => {
    expect(shortcutFor(key('!', { shiftKey: true }))).toBeNull()
  })

  it('does nothing while typing in a text or number field', () => {
    for (const type of ['text', 'number']) {
      const target = { tagName: 'INPUT', type }
      expect(shortcutFor(key('?', { shiftKey: true }, target))).toBeNull()
      expect(shortcutFor(key('3', {}, target))).toBeNull()
    }
    expect(shortcutFor(key('3', {}, { tagName: 'TEXTAREA' }))).toBeNull()
  })

  it('still works with a slider focused', () => {
    expect(shortcutFor(key('3', {}, { tagName: 'INPUT', type: 'range' }))).toBe('step3')
  })
})

describe('accept, reject and export keys', () => {
  it('maps A to accept and Shift+A to reject', () => {
    expect(shortcutFor(key('a'))).toBe('accept')
    expect(shortcutFor(key('A', { shiftKey: true }))).toBe('reject')
  })

  it('reads a capital A without Shift (caps lock) as accept', () => {
    expect(shortcutFor(key('A'))).toBe('accept')
  })

  it('maps Ctrl+E and Cmd+E to export, and leaves the Shift and Alt forms alone', () => {
    expect(shortcutFor(key('e', { ctrlKey: true }))).toBe('export')
    expect(shortcutFor(key('e', { metaKey: true }))).toBe('export')
    expect(shortcutFor(key('e', { ctrlKey: true, shiftKey: true }))).toBeNull()
    expect(shortcutFor(key('e', { ctrlKey: true, altKey: true }))).toBeNull()
    expect(shortcutFor(key('e'))).toBeNull()
  })

  it('does nothing in a text field', () => {
    const target = { tagName: 'INPUT', type: 'text' }
    expect(shortcutFor(key('a', {}, target))).toBeNull()
    expect(shortcutFor(key('e', { ctrlKey: true }, target))).toBeNull()
  })
})

describe('standard view keys', () => {
  it('maps Shift and a digit to the six views by key position, whatever symbol the layout types', () => {
    for (let n = 1; n <= 6; n++) {
      expect(shortcutFor(key('!', { shiftKey: true, code: `Digit${n}` }))).toBe(`view${n}`)
    }
    expect(shortcutFor(key('"', { shiftKey: true, code: 'Digit2' }))).toBe('view2')
  })

  it('keeps the plain digit for the steps even when the key position is known', () => {
    expect(shortcutFor(key('3', { code: 'Digit3' }))).toBe('step3')
  })

  it('leaves Shift with 0, 7 to 9 and with Ctrl, Cmd or Alt alone', () => {
    expect(shortcutFor(key(')', { shiftKey: true, code: 'Digit0' }))).toBeNull()
    expect(shortcutFor(key('&', { shiftKey: true, code: 'Digit7' }))).toBeNull()
    expect(shortcutFor(key('!', { shiftKey: true, ctrlKey: true, code: 'Digit1' }))).toBeNull()
    expect(shortcutFor(key('!', { shiftKey: true, metaKey: true, code: 'Digit1' }))).toBeNull()
    expect(shortcutFor(key('!', { shiftKey: true, altKey: true, code: 'Digit1' }))).toBeNull()
  })

  it('does nothing in a text field', () => {
    expect(shortcutFor(key('!', { shiftKey: true, code: 'Digit1' }, { tagName: 'INPUT', type: 'text' }))).toBeNull()
  })

  // AZERTY types & without Shift and 1 with it on the same key, so "1" and "Shift+1" are one keystroke there.
  it('gives the top row to the views on AZERTY and leaves the steps on the numpad', () => {
    expect(shortcutFor(key('1', { shiftKey: true, code: 'Digit1' }))).toBe('view1')
    expect(shortcutFor(key('&', { code: 'Digit1' }))).toBeNull()
    expect(shortcutFor(key('1', { code: 'Numpad1' }))).toBe('step1')
    expect(shortcutFor(key('6', { code: 'Numpad6' }))).toBe('step6')
  })
})

describe('stepForShortcut', () => {
  it('picks the step by position in the stepper', () => {
    expect(stepForShortcut('step1', STEPS)).toBe('import')
    expect(stepForShortcut('step4', STEPS)).toBe('access')
    expect(stepForShortcut('step6', STEPS)).toBe('export')
  })
})

describe('shortcutGate', () => {
  it('lets every shortcut through while the sheet is closed', () => {
    for (const id of ALL) expect(shortcutGate(id, false), id).toBe(true)
  })

  it('lets only help through while the sheet is open', () => {
    expect(shortcutGate('help', true)).toBe(true)
    for (const id of ALL.filter((id) => id !== 'help')) expect(shortcutGate(id, true), id).toBe(false)
  })
})
