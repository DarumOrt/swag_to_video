import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from './cn'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: ReactNode
  /** Accessible name when `label` is not plain text. */
  title?: string
}

export interface SegmentedProps<T extends string | number> {
  label: string
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
  hideLabel?: boolean
  disabled?: boolean
  className?: string
}

/** Segmented control (radio group): arrow keys move the selection, like native radios. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hideLabel,
  disabled,
  className,
}: SegmentedProps<T>) {
  const labelId = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )

  function onKeyDown(event: KeyboardEvent) {
    let delta = 0
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') delta = 1
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') delta = -1
    if (!delta) return
    event.preventDefault()
    const next = (selected + delta + options.length) % options.length
    const option = options[next]
    if (!option) return
    onChange(option.value)
    refs.current[next]?.focus()
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span id={labelId} className={cn('text-xs text-muted', hideLabel && 'sr-only')}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={onKeyDown}
        className="flex gap-0.5 rounded-md border border-line bg-bg p-0.5"
      >
        {options.map((option, index) => {
          const checked = index === selected
          return (
            <button
              key={String(option.value)}
              ref={(node) => {
                refs.current[index] = node
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.title}
              title={option.title}
              tabIndex={checked ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                'tabular flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-sm px-2 text-xs',
                'transition-[background-color,color] duration-150 ease-out',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
                'disabled:opacity-45',
                checked
                  ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]'
                  : 'text-muted hover:text-fg',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
