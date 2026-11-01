import * as RadixTabs from '@radix-ui/react-tabs'
import type { ReactNode } from 'react'

export const Tabs = RadixTabs.Root

export function TabList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <RadixTabs.List aria-label={label} className="flex shrink-0 border-b border-line px-2">
      {children}
    </RadixTabs.List>
  )
}

export function Tab({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className="-mb-px h-9 border-b-2 border-transparent px-3 text-ink-1 outline-none hover:text-ink-0 focus-visible:text-ink-0 focus-visible:ring-1 focus-visible:ring-brand data-[state=active]:border-brand data-[state=active]:text-ink-0"
    >
      {children}
    </RadixTabs.Trigger>
  )
}

export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <RadixTabs.Content value={value} className={`min-h-0 flex-1 outline-none ${className ?? ''}`}>
      {children}
    </RadixTabs.Content>
  )
}
