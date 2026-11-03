// The store registers its undo history here, so a slice can empty it without importing the store (which imports the slice).
let clear: () => void = () => {}

export const registerHistoryClear = (fn: () => void): void => {
  clear = fn
}

export const clearHistory = (): void => clear()
