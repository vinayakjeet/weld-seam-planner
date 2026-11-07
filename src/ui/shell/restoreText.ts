// When a saved plan was saved, in the reader's locale. A month name keeps 7 November from reading as 11 July in a
// day-first locale, and seconds add nothing to "which save was this".
export function savedOnText(savedAt: string, locale?: string, timeZone?: string): string {
  return new Date(savedAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone })
}
