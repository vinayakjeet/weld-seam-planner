export type Shortcut = 'fit' | 'undo' | 'redo'

export interface KeyEventLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  target: { tagName?: string; type?: string; isContentEditable?: boolean } | null
}

// Inputs that take no typed text keep the shortcuts: a focused slider or checkbox is not a text field.
const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color', 'image'])

function isTextEntry(target: KeyEventLike['target']): boolean {
  if (!target) return false
  if (target.isContentEditable) return true
  const tag = target.tagName?.toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  return tag === 'INPUT' && !NON_TEXT_INPUTS.has((target.type ?? 'text').toLowerCase())
}

export function shortcutFor(event: KeyEventLike): Shortcut | null {
  if (isTextEntry(event.target) || event.altKey) return null
  const key = event.key.toLowerCase()
  const modifier = event.ctrlKey || event.metaKey
  if (key === 'f' && !modifier) return 'fit'
  if (key === 'z' && modifier) return event.shiftKey ? 'redo' : 'undo'
  return null
}
