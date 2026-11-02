import { cn } from '@/ui'
import { t } from '../i18n'
import { useAppStore } from '../store'

export function AnalysisStatusBadge({ className }: { className?: string }) {
  const status = useAppStore((state) => state.analysis.status)
  const busy = status === 'decoding' || status === 'analyzing'
  return (
    <span
      role="status"
      className={cn('flex shrink-0 items-center gap-1.5 text-xs text-muted', className)}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          status === 'ready' && 'bg-accent',
          status === 'error' && 'bg-danger',
          busy && 'animate-pulse bg-warn',
          status === 'idle' && 'bg-subtle',
        )}
      />
      {t.analysis[status]}
    </span>
  )
}
