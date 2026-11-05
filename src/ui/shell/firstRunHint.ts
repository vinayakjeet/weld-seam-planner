const COUNT_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']

// The line under the empty-state subtitle: how many steps there are and what they are called.
export function firstRunHint(steps: ReadonlyArray<{ label: string }>): string {
  const count = COUNT_WORDS[steps.length] ?? String(steps.length)
  return `${count} steps: ${steps.map((s) => s.label).join(', ')}.`
}
