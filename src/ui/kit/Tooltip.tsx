import * as RadixTooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RadixTooltip.Provider delayDuration={300}>{children}</RadixTooltip.Provider>
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side="bottom"
          sideOffset={6}
          className="z-50 max-w-64 rounded-sm border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink-0 shadow-lg"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
