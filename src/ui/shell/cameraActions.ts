// The camera lives in the 3D view, which mounts after the page; the keyboard belongs to the page from the start. The
// view registers what the camera keys do, and until it has, those keys do nothing.
export interface CameraActions {
  fit: () => void
  showView: (index: number) => void
}

let current: CameraActions | null = null

export function registerCamera(actions: CameraActions): () => void {
  current = actions
  return () => {
    if (current === actions) current = null
  }
}

export const cameraActions = (): CameraActions | null => current
