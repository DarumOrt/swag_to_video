import { ChevronDown } from 'lucide-react'
import { useId } from 'react'
import { cn } from './cn'

export interface SelectOption<T extends string> {
  value: T
  label: string
  hint?: string
}

export interface SelectProps<T extends string> {
  label: string
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
}

/** Styled native <select>: native keyboard/touch behaviour, no popover dependency. */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
}: SelectProps<T>) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs text-muted">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value as T)}
          className={cn(
            'tabular h-8 w-full appearance-none rounded-md border border-line-strong bg-raised pr-8 pl-2.5',
            'text-[13px] text-fg transition-colors duration-150 hover:bg-hover',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
            'disabled:opacity-45',
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.hint ? `${option.label} · ${option.hint}` : option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-subtle"
        />
      </div>
    </div>
  )
}
