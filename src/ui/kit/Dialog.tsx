import * as RadixDialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: ReactNode
  // For forms: wider, and scrolls when the form is taller than the window.
  wide?: boolean
}

export function Dialog({ open, onOpenChange, title, description, children, wide = false }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <RadixDialog.Content
          className={`fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 border border-line bg-surface-1 p-5 shadow-lg outline-none ${
            wide ? 'max-h-[calc(100vh-48px)] w-[min(720px,calc(100vw-32px))] overflow-y-auto' : 'w-[min(440px,calc(100vw-32px))]'
          }`}
        >
          <RadixDialog.Title className="text-base font-semibold text-ink-0">{title}</RadixDialog.Title>
          <RadixDialog.Description className="mt-1.5 text-ink-1">{description}</RadixDialog.Description>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
