import { TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/ui'
import { detectFeatures } from '../features'
import { t } from '../i18n'

export function CompatBanner() {
  const [features] = useState(detectFeatures)
  const [dismissed, setDismissed] = useState(false)

  const problems = [
    !features.webCodecs && t.compat.webCodecs,
    !features.webGpu && t.compat.webGpu,
    !features.crossOriginIsolated && t.compat.isolation,
  ].filter((problem): problem is string => Boolean(problem))

  if (dismissed || problems.length === 0) return null

  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-warn/25 bg-warn-soft px-4 py-2.5 text-[13px]"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-warn">{t.compat.title}</p>
        <ul className="mt-0.5 text-muted">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="-my-1"
        aria-label={t.compat.dismiss}
        title={t.compat.dismiss}
        onClick={() => setDismissed(true)}
      >
        <X />
      </Button>
    </div>
  )
}
