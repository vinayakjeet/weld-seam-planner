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
    expect(shortcutFor(key('Escape'))).toBeNull()
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
