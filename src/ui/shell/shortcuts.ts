export type Shortcut =
  | 'fit'
  | 'undo'
  | 'redo'
  | 'draw'
  | 'split'
  | 'reverse'
  | 'remove'
  | 'play'
  // Keys of the draw tool; they only do something while a tool is armed.
  | 'finish'
  | 'cancel'
  | 'undoPoint'

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

const LETTER_KEYS: Record<string, Shortcut | undefined> = { f: 'fit', d: 'draw', s: 'split', r: 'reverse' }

// Enter on a focused button or link activates it; taking the key would leave the button dead.
function isActivatable(target: KeyEventLike['target']): boolean {
  const tag = target?.tagName?.toUpperCase()
  return tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY'
}

export function shortcutFor(event: KeyEventLike): Shortcut | null {
  if (isTextEntry(event.target) || event.altKey) return null
  const key = event.key.toLowerCase()
  const modifier = event.ctrlKey || event.metaKey
  if (key === 'z' && modifier) return event.shiftKey ? 'redo' : 'undo'
  // Ctrl+R reloads and Ctrl+D bookmarks, so the tool keys never take a modifier. Shift is allowed for caps lock.
  if (modifier) return null
  const letter = LETTER_KEYS[key]
  if (letter) return letter
  if (key === 'delete') return event.shiftKey ? null : 'remove'
  if (event.shiftKey) return null
  // Space presses a focused button, so it only plays when nothing that takes the key has the focus.
  if (key === ' ') return isActivatable(event.target) ? null : 'play'
  if (key === 'enter') return isActivatable(event.target) ? null : 'finish'
  if (key === 'escape') return 'cancel'
  if (key === 'backspace') return 'undoPoint'
  return null
}
