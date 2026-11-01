interface FileDropEvent extends Event {
  dataTransfer: { types: readonly string[]; files: ArrayLike<File>; dropEffect: string } | null
}

function carriesFiles(event: Event): event is FileDropEvent {
  return (event as FileDropEvent).dataTransfer?.types.includes('Files') ?? false
}

// Without this, a file dropped anywhere that does not handle it makes the browser open the file and leave the app,
// which loses the session. A drop that a nearer element already handled (it called preventDefault) is not handed on.
export function installDropGuard(target: EventTarget, onFiles: (files: File[]) => void): () => void {
  const onDragOver = (event: Event) => {
    if (!carriesFiles(event)) return
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'copy'
  }
  const onDrop = (event: Event) => {
    if (!carriesFiles(event)) return
    const handled = event.defaultPrevented
    event.preventDefault()
    if (!handled) onFiles(Array.from(event.dataTransfer!.files))
  }
  target.addEventListener('dragover', onDragOver)
  target.addEventListener('drop', onDrop)
  return () => {
    target.removeEventListener('dragover', onDragOver)
    target.removeEventListener('drop', onDrop)
  }
}
