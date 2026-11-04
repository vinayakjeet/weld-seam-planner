// True while another tool owns the pointer on the canvas, so a seam under it must not be lit, picked or toggled.
export function pointerClaimed(state: { tool: { tool: string }; placingPort: boolean }): boolean {
  return state.tool.tool === 'draw' || state.tool.tool === 'split' || state.placingPort
}
