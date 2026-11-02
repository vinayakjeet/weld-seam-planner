import { describe, expect, it } from 'vitest'
import { shortcutFor, type KeyEventLike } from '../../../src/ui/shell/shortcuts'

function key(k: string, mods: Partial<KeyEventLike> = {}, target: KeyEventLike['target'] = { tagName: 'BODY' }): KeyEventLike {
  return { key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target, ...mods }
}

describe('shortcutFor', () => {
  it('maps F to fit, in either case', () => {
    expect(shortcutFor(key('f'))).toBe('fit')
    expect(shortcutFor(key('F', { shiftKey: true }))).toBe('fit')
    expect(shortcutFor(key('F'))).toBe('fit')
  })

  it('leaves browser shortcuts that use F alone', () => {
    expect(shortcutFor(key('f', { ctrlKey: true }))).toBeNull()
    expect(shortcutFor(key('f', { metaKey: true }))).toBeNull()
    expect(shortcutFor(key('f', { altKey: true }))).toBeNull()
  })

  it('maps Ctrl+Z to undo and Ctrl+Shift+Z to redo', () => {
    expect(shortcutFor(key('z', { ctrlKey: true }))).toBe('undo')
    expect(shortcutFor(key('Z', { ctrlKey: true, shiftKey: true }))).toBe('redo')
  })

  it('accepts Cmd in place of Ctrl, for macOS', () => {
    expect(shortcutFor(key('z', { metaKey: true }))).toBe('undo')
    expect(shortcutFor(key('Z', { metaKey: true, shiftKey: true }))).toBe('redo')
  })

  it('needs the modifier for undo and ignores Alt combinations', () => {
    expect(shortcutFor(key('z'))).toBeNull()
    expect(shortcutFor(key('z', { ctrlKey: true, altKey: true }))).toBeNull()
  })

  it('ignores unrelated keys', () => {
    expect(shortcutFor(key('g'))).toBeNull()
    expect(shortcutFor(key('Tab'))).toBeNull()
    expect(shortcutFor(key('y', { ctrlKey: true }))).toBeNull()
  })

  it('does nothing while typing in a text field, so the field keeps its own undo', () => {
    for (const type of ['text', 'search', 'number', 'email', 'password']) {
      const target = { tagName: 'INPUT', type }
      expect(shortcutFor(key('f', {}, target))).toBeNull()
      expect(shortcutFor(key('z', { ctrlKey: true }, target))).toBeNull()
    }
    expect(shortcutFor(key('f', {}, { tagName: 'TEXTAREA' }))).toBeNull()
    expect(shortcutFor(key('f', {}, { tagName: 'SELECT' }))).toBeNull()
    expect(shortcutFor(key('f', {}, { tagName: 'DIV', isContentEditable: true }))).toBeNull()
  })

  it('still works on a range input, such as the crease slider', () => {
    const range = { tagName: 'INPUT', type: 'range' }
    expect(shortcutFor(key('f', {}, range))).toBe('fit')
    expect(shortcutFor(key('z', { ctrlKey: true }, range))).toBe('undo')
  })

  it('still works on buttons and checkboxes', () => {
    expect(shortcutFor(key('z', { ctrlKey: true }, { tagName: 'BUTTON' }))).toBe('undo')
    expect(shortcutFor(key('f', {}, { tagName: 'INPUT', type: 'checkbox' }))).toBe('fit')
  })

  it('works when there is no focused element', () => {
    expect(shortcutFor(key('f', {}, null))).toBe('fit')
  })
})

describe('shortcutFor: manual seam tools', () => {
  it('maps D, S and R to draw, split and reverse, in either case', () => {
    expect(shortcutFor(key('d'))).toBe('draw')
    expect(shortcutFor(key('S', { shiftKey: true }))).toBe('split')
    expect(shortcutFor(key('r'))).toBe('reverse')
    expect(shortcutFor(key('D'))).toBe('draw')
  })

  it('maps Delete to remove', () => {
    expect(shortcutFor(key('Delete'))).toBe('remove')
  })

  it('leaves Ctrl, Cmd and Alt combinations to the browser, so Ctrl+R still reloads and Ctrl+D still bookmarks', () => {
    for (const k of ['d', 's', 'r', 'Delete']) {
      expect(shortcutFor(key(k, { ctrlKey: true }))).toBeNull()
      expect(shortcutFor(key(k, { metaKey: true }))).toBeNull()
      expect(shortcutFor(key(k, { altKey: true }))).toBeNull()
    }
  })

  it('does nothing while a text field has focus, so typing a trim value keeps its letters', () => {
    for (const k of ['d', 's', 'r', 'Delete', 'Enter', 'Escape', 'Backspace']) {
      for (const target of [
        { tagName: 'INPUT', type: 'text' },
        { tagName: 'INPUT', type: 'number' },
        { tagName: 'TEXTAREA' },
        { tagName: 'SELECT' },
        { tagName: 'DIV', isContentEditable: true },
      ]) {
        expect(shortcutFor(key(k, {}, target))).toBeNull()
      }
    }
  })

  it('still works on a range input, a checkbox and a button', () => {
    expect(shortcutFor(key('d', {}, { tagName: 'INPUT', type: 'range' }))).toBe('draw')
    expect(shortcutFor(key('r', {}, { tagName: 'INPUT', type: 'checkbox' }))).toBe('reverse')
    expect(shortcutFor(key('Delete', {}, { tagName: 'BUTTON' }))).toBe('remove')
  })

  it('maps Enter, Escape and Backspace to the drawing keys', () => {
    expect(shortcutFor(key('Enter'))).toBe('finish')
    expect(shortcutFor(key('Escape'))).toBe('cancel')
    expect(shortcutFor(key('Backspace'))).toBe('undoPoint')
  })

  it('leaves Enter to a focused button or link, which it would otherwise activate', () => {
    expect(shortcutFor(key('Enter', {}, { tagName: 'BUTTON' }))).toBeNull()
    expect(shortcutFor(key('Enter', {}, { tagName: 'A' }))).toBeNull()
  })

  it('ignores the drawing keys with a modifier held', () => {
    expect(shortcutFor(key('Enter', { ctrlKey: true }))).toBeNull()
    expect(shortcutFor(key('Backspace', { altKey: true }))).toBeNull()
    expect(shortcutFor(key('Escape', { shiftKey: true }))).toBeNull()
  })
})

