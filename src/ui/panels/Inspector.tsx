const SECTIONS = [
  { title: 'Geometry', empty: 'Select a seam to see its length, leg size and joint type.' },
  { title: 'Procedure', empty: 'Select a seam to choose a welding procedure and override its values.' },
  { title: 'Torch', empty: 'Select a seam to set work and travel angles and preview the torch.' },
  { title: 'Access', empty: 'Select a seam to see whether the torch can reach it.' },
  { title: 'Notes', empty: 'Select a seam to add notes for the shop floor.' },
]

export function Inspector() {
  return (
    <aside aria-label="Inspector" className="w-[340px] shrink-0 overflow-y-auto border-l border-line bg-surface-1">
      {SECTIONS.map((section) => (
        <section key={section.title} className="border-b border-line px-4 py-3">
          <h2 className="mb-1.5 text-xs font-semibold text-ink-0">{section.title}</h2>
          <p className="text-ink-2">{section.empty}</p>
        </section>
      ))}
    </aside>
  )
}
