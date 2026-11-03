// Hands text to the browser as a file download.
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // The click starts the download synchronously; revoking on the next turn keeps the URL alive until then.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
