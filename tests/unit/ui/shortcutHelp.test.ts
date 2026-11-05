import { describe, expect, it } from 'vitest'
import { STEPS } from '../../../src/state/store'
import { SHORTCUT_HELP, shortcutFor, shortcutGate, stepForShortcut, type KeyEventLike, type Shortcut } from '../../../src/ui/shell/shortcuts'

function key(k: string, mods: Partial<KeyEventLike> = {}, target: KeyEventLike['target'] = { tagName: 'BODY' }): KeyEventLike {
  return { key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target, ...mods }
}

const NAMED: Record<string, string> = { Space: ' ', Delete: 'Delete', Enter: 'Enter', Escape: 'Escape', Backspace: 'Backspace' }

// Reads a row's key label ("Ctrl+Shift+Z", "?", "Space") as the event a browser would send for it.
function eventFor(chord: string): KeyEventLike {
  const parts = chord === '+' ? ['+'] : chord.split('+')
  const last = parts[parts.length - 1]!
  const mods = parts.slice(0, -1)
  return key(NAMED[last] ?? last, {
    ctrlKey: mods.includes('Ctrl'),
    metaKey: mods.includes('Cmd'),
    shiftKey: mods.includes('Shift') || last === '?',
  })
}

const ALL: Shortcut[] = [
  'fit', 'undo', 'redo', 'draw', 'split', 'reverse', 'remove', 'play', 'xray', 'finish', 'cancel', 'undoPoint',
  'help', 'step1', 'step2', 'step3', 'step4', 'step5', 'step6',
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

  it('groups the rows under View, Steps, Tools, Playback and History, with a label each', () => {
    expect(new Set(SHORTCUT_HELP.map((row) => row.group))).toEqual(new Set(['View', 'Steps', 'Tools', 'Playback', 'History']))
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
