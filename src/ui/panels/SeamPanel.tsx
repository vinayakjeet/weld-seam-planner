import { Tab, TabList, TabPanel, Tabs } from '../kit/Tabs'

const COLUMNS = [
  { key: 'n', label: '#', title: 'Seam number' },
  { key: 'label', label: 'Label', title: 'Label' },
  { key: 'type', label: 'Type', title: 'Joint type' },
  { key: 'len', label: 'Len', title: 'Length in millimetres' },
  { key: 'wps', label: 'WPS', title: 'Welding procedure' },
  { key: 'pos', label: 'Pos', title: 'Welding position' },
  { key: 'acc', label: 'Acc', title: 'Access class' },
  { key: 'status', label: '', title: 'Status' },
]

const GRID = 'grid grid-cols-[22px_minmax(0,1fr)_34px_34px_34px_28px_28px_16px] items-center gap-x-1.5 px-3'

function SeamTable() {
  return (
    <div role="table" aria-label="Seams" className="flex h-full flex-col">
      <div role="row" className={`${GRID} h-7 shrink-0 border-b border-line text-[11px] text-ink-2`}>
        {COLUMNS.map((c) => (
          <span key={c.key} role="columnheader" title={c.title} className="truncate">
            {c.label}
          </span>
        ))}
      </div>
      <div className="grid flex-1 place-items-center px-6 text-center text-ink-2">
        <p>
          No seams yet. Seam candidates appear here once a part is loaded.
          <br />
          Drop an STL file or pick a sample to start.
        </p>
      </div>
    </div>
  )
}

export function SeamPanel() {
  return (
    <aside aria-label="Seam list" className="flex min-h-0 w-[300px] shrink-0 flex-col border-r border-line bg-surface-1">
      <Tabs defaultValue="seams" className="flex min-h-0 flex-1 flex-col">
        <TabList label="Left panel">
          <Tab value="seams">Seams</Tab>
          <Tab value="detection">Detection</Tab>
        </TabList>
        <TabPanel value="seams" className="data-[state=active]:flex data-[state=active]:flex-col">
          <div className="flex shrink-0 gap-1.5 border-b border-line px-3 py-2">
            {['Candidates', 'Accepted', 'Warnings'].map((chip) => (
              <span key={chip} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2">
                {chip}
              </span>
            ))}
          </div>
          <SeamTable />
        </TabPanel>
        <TabPanel value="detection" className="p-3 text-ink-2">
          <p>Detection settings and the body list appear here once a part is loaded.</p>
        </TabPanel>
      </Tabs>
    </aside>
  )
}
