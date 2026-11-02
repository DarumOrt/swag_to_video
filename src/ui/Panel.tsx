import type { ReactNode } from 'react'
import { cn } from './cn'

export interface PanelProps {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** A titled group of controls inside a sidebar. */
export function Panel({ title, actions, children, className }: PanelProps) {
  return (
    <section className={cn('flex flex-col gap-3 border-b border-line px-4 py-4', className)}>
      {(title || actions) && (
        <header className="flex min-h-5 items-center justify-between gap-2">
          {title && (
            <h2 className="text-2xs font-semibold tracking-[0.08em] text-subtle uppercase">
              {title}
            </h2>
          )}
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}
