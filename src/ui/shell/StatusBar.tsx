function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-ink-2">{label}</span>
      <span className="num text-ink-1">{value}</span>
    </span>
  )
}

export function StatusBar() {
  return (
    <footer className="flex h-6 items-center gap-5 border-t border-line bg-surface-1 px-3 text-[11px]">
      <Stat label="Triangles" value="0" />
      <Stat label="Bodies" value="0" />
      <Stat label="Seams accepted / candidate" value="0 / 0" />
      <Stat label="Weld length" value="0 mm" />
      <Stat label="Cycle time" value="0:00" />
      <span className="ml-auto text-ink-2">Pre-flight: no part loaded</span>
    </footer>
  )
}
