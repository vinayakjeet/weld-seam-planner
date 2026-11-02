import * as Menu from '@radix-ui/react-dropdown-menu'
import type { JointType } from '../../core/seams/classify'
import { useStore } from '../../state/store'
import { JOINT_TYPES, jointLabel, type SeamRow } from './seamRows'

const UNKNOWN_HINT =
  'The inside of this part could not be told from the outside, so this type is a guess. Click to set it yourself.'

// The Type cell. Picking the detected type again removes the override.
export function TypeMenu({ row }: { row: SeamRow }) {
  const setType = useStore((s) => s.setType)
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button
          type="button"
          title={row.type.endsWith('?') ? UNKNOWN_HINT : 'Change the joint type'}
          onClick={(e) => e.stopPropagation()}
          className={`block w-full truncate rounded-sm text-left outline-none hover:text-ink-0 focus-visible:ring-1 focus-visible:ring-brand ${
            row.overridden ? 'text-ink-0' : ''
          }`}
        >
          {row.type}
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={4}
          aria-label={`Joint type of ${row.label}`}
          // The menu renders in a portal, but React events still bubble to the row, which would select it.
          onClick={(e) => e.stopPropagation()}
          className="z-50 min-w-40 rounded-sm border border-line bg-surface-2 p-1 text-xs text-ink-0 shadow-lg"
        >
          <Menu.RadioGroup value={row.jointType} onValueChange={(value) => setType(row.id, value as JointType)}>
            {JOINT_TYPES.map((type) => (
              <Menu.RadioItem
                key={type}
                value={type}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 outline-none data-[highlighted]:bg-brand/20"
              >
                <span className="size-3 text-brand">
                  <Menu.ItemIndicator>&bull;</Menu.ItemIndicator>
                </span>
                <span>{jointLabel(type)}</span>
                {type === row.computedType && <span className="text-ink-2">(detected)</span>}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
