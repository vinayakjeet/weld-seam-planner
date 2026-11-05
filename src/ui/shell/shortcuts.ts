export type Shortcut =
  | 'fit'
  | 'undo'
  | 'redo'
  | 'draw'
  | 'split'
  | 'reverse'
  | 'remove'
  | 'play'
  | 'xray'
  | 'accept'
  | 'reject'
  | 'export'
  // Keys of the draw tool; they only do something while a tool is armed.
  | 'finish'
  | 'cancel'
  | 'undoPoint'
  | 'help'
  | StepShortcut
  | ViewShortcut

export type StepShortcut = 'step1' | 'step2' | 'step3' | 'step4' | 'step5' | 'step6'

export type ViewShortcut = 'view1' | 'view2' | 'view3' | 'view4' | 'view5' | 'view6'

export interface KeyEventLike {
  key: string
  // The physical key. Shift changes what key reads for a digit, so the views are read from here.
  code?: string
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

const LETTER_KEYS: Record<string, Shortcut | undefined> = { f: 'fit', d: 'draw', s: 'split', r: 'reverse', x: 'xray' }

// Shift+A rejects. A capital A with caps lock on arrives without the shift flag and still accepts.

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
  if (key === 'e' && modifier) return event.shiftKey ? null : 'export'
  // Ctrl+R reloads and Ctrl+D bookmarks, so the tool keys never take a modifier. Shift is allowed for caps lock.
  if (modifier) return null
  // Shift and a digit show a standard view. The symbol Shift types depends on the layout, so the key position is read.
  const digit = event.shiftKey ? /^Digit([1-6])$/.exec(event.code ?? '') : null
  if (digit) return `view${digit[1]}` as ViewShortcut
  // A digit jumps to that step; the question mark opens the sheet. Both are read before the generic shift rule.
  if (/^[1-6]$/.test(key)) return `step${key}` as StepShortcut
  if (key === '?') return 'help'
  if (key === 'a') return event.shiftKey ? 'reject' : 'accept'
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

// The step a number key opens, by position in the stepper (the same step a click on that button opens).
// The standard view a view key shows, as a position in STANDARD_VIEWS.
export function viewForShortcut(id: ViewShortcut): number {
  return Number(id.slice(4)) - 1
}

export function stepForShortcut<T extends { id: string }>(id: StepShortcut, steps: ReadonlyArray<T>): T['id'] {
  return steps[Number(id.slice(4)) - 1]!.id
}

// While the shortcut sheet is open, only the key that closes it still works.
export function shortcutGate(id: Shortcut, sheetOpen: boolean): boolean {
  return !sheetOpen || id === 'help'
}

export interface ShortcutHelpRow {
  id: Shortcut
  // Alternative ways to press it, written as a person reads them: "Ctrl+Z", "Space", "?".
  keys: string[]
  label: string
  group: 'View' | 'Steps' | 'Tools' | 'Playback' | 'File' | 'History'
}

// The only source for the sheet. The step rows are named from the stepper where the sheet is drawn.
export const SHORTCUT_HELP: ReadonlyArray<ShortcutHelpRow> = [
  { id: 'fit', keys: ['F'], label: 'Fit view', group: 'View' },
  { id: 'xray', keys: ['X'], label: 'Toggle x-ray', group: 'View' },
  { id: 'help', keys: ['?'], label: 'Show or hide this list', group: 'View' },
  { id: 'view1', keys: ['Shift+1'], label: 'Front view', group: 'View' },
  { id: 'view2', keys: ['Shift+2'], label: 'Back view', group: 'View' },
  { id: 'view3', keys: ['Shift+3'], label: 'Left view', group: 'View' },
  { id: 'view4', keys: ['Shift+4'], label: 'Right view', group: 'View' },
  { id: 'view5', keys: ['Shift+5'], label: 'Top view', group: 'View' },
  { id: 'view6', keys: ['Shift+6'], label: 'Bottom view', group: 'View' },
  { id: 'step1', keys: ['1'], label: 'Go to step 1', group: 'Steps' },
  { id: 'step2', keys: ['2'], label: 'Go to step 2', group: 'Steps' },
  { id: 'step3', keys: ['3'], label: 'Go to step 3', group: 'Steps' },
  { id: 'step4', keys: ['4'], label: 'Go to step 4', group: 'Steps' },
  { id: 'step5', keys: ['5'], label: 'Go to step 5', group: 'Steps' },
  { id: 'step6', keys: ['6'], label: 'Go to step 6', group: 'Steps' },
  { id: 'accept', keys: ['A'], label: 'Accept the selected seams', group: 'Tools' },
  { id: 'reject', keys: ['Shift+A'], label: 'Reject the selected seams', group: 'Tools' },
  { id: 'draw', keys: ['D'], label: 'Draw a seam', group: 'Tools' },
  { id: 'split', keys: ['S'], label: 'Split the selected seam', group: 'Tools' },
  { id: 'reverse', keys: ['R'], label: 'Reverse the selected seam', group: 'Tools' },
  { id: 'remove', keys: ['Delete'], label: 'Delete the selected drawn seam', group: 'Tools' },
  { id: 'finish', keys: ['Enter'], label: 'Finish the drawing', group: 'Tools' },
  { id: 'undoPoint', keys: ['Backspace'], label: 'Remove the last point', group: 'Tools' },
  { id: 'cancel', keys: ['Escape'], label: 'Cancel the tool', group: 'Tools' },
  { id: 'play', keys: ['Space'], label: 'Play or pause the timeline', group: 'Playback' },
  { id: 'export', keys: ['Ctrl+E', 'Cmd+E'], label: 'Export the job file', group: 'File' },
  { id: 'undo', keys: ['Ctrl+Z', 'Cmd+Z'], label: 'Undo', group: 'History' },
  { id: 'redo', keys: ['Ctrl+Shift+Z', 'Cmd+Shift+Z'], label: 'Redo', group: 'History' },
]
