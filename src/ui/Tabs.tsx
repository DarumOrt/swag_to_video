import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from './cn'

export interface TabItem<T extends string> {
  value: T
  label: ReactNode
  content: ReactNode
  disabled?: boolean
}

export interface TabsProps<T extends string> {
  label: string
  value: T
  items: readonly TabItem<T>[]
  onChange: (value: T) => void
  className?: string
}

/** WAI-ARIA tabs with automatic activation on arrow keys. */
export function Tabs<T extends string>({ label, value, items, onChange, className }: TabsProps<T>) {
  const baseId = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const enabled = items.filter((item) => !item.disabled)

  function onKeyDown(event: KeyboardEvent) {
    const position = enabled.findIndex((item) => item.value === value)
    let next = -1
    if (event.key === 'ArrowRight') next = (position + 1) % enabled.length
    else if (event.key === 'ArrowLeft') next = (position - 1 + enabled.length) % enabled.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = enabled.length - 1
    const target = enabled[next]
    if (!target) return
    event.preventDefault()
    onChange(target.value)
    refs.current[items.indexOf(target)]?.focus()
  }

  const active = items.find((item) => item.value === value)

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex shrink-0 gap-4 border-b border-line px-4"
      >
        {items.map((item, index) => {
          const selected = item.value === value
          return (
            <button
              key={item.value}
              ref={(node) => {
                refs.current[index] = node
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.value}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.value}`}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => onChange(item.value)}
              className={cn(
                '-mb-px flex h-10 items-center gap-1.5 border-b-2 text-[13px] font-medium',
                'transition-colors duration-150 ease-out',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                'disabled:cursor-default disabled:opacity-40',
                selected ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {active && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.value}`}
          aria-labelledby={`${baseId}-tab-${active.value}`}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {active.content}
        </div>
      )}
    </div>
  )
}
