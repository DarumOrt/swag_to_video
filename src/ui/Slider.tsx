import { useId, type CSSProperties } from 'react'
import { cn } from './cn'

export interface SliderProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  /** Formats the value shown on the right of the label. */
  format?: (value: number) => string
  hideLabel?: boolean
  disabled?: boolean
  className?: string
}

/** Labelled native range input — keyboard and screen-reader support for free. */
export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format,
  hideLabel,
  disabled,
  className,
}: SliderProps) {
  const id = useId()
  const progress = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className={cn('flex items-baseline justify-between gap-2', hideLabel && 'sr-only')}>
        <label htmlFor={id} className="text-xs text-muted">
          {label}
        </label>
        {format && <span className="tabular font-mono text-2xs text-subtle">{format(value)}</span>}
      </div>
      <input
        id={id}
        type="range"
        className="range w-full"
        style={{ '--range-progress': `${progress}%` } as CSSProperties}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={format?.(value)}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </div>
  )
}
