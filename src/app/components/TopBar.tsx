import { t } from '../i18n'

export function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <Logo />
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tracking-tight">{t.app.name}</span>
        <span className="hidden text-xs text-subtle sm:inline">{t.app.tagline}</span>
      </div>
      <span className="ml-auto hidden text-2xs text-subtle md:inline">{t.player.shortcuts}</span>
    </header>
  )
}

/** Three meter bars — the product's mark. */
function Logo() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 text-accent" aria-hidden>
      <rect x="2" y="9" width="4" height="9" rx="1" fill="currentColor" opacity="0.55" />
      <rect x="8" y="2" width="4" height="16" rx="1" fill="currentColor" />
      <rect x="14" y="6" width="4" height="12" rx="1" fill="currentColor" opacity="0.8" />
    </svg>
  )
}
