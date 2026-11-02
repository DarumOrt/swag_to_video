import { useState } from 'react'
import { Tabs, type TabItem } from '@/ui'
import { t } from '../i18n'
import { ExportPanel } from './ExportPanel'
import { OutputPanel } from './OutputPanel'
import { TrackPanel } from './TrackPanel'

type SidebarTab = 'output' | 'style' | 'accents'

const SOON = <p className="px-4 py-6 text-xs text-subtle">{t.sidebar.soon}</p>

const ITEMS: TabItem<SidebarTab>[] = [
  { value: 'output', label: t.sidebar.output, content: <OutputPanel /> },
  { value: 'style', label: t.sidebar.style, content: SOON, disabled: true },
  { value: 'accents', label: t.sidebar.accents, content: SOON, disabled: true },
]

export function Sidebar() {
  const [tab, setTab] = useState<SidebarTab>('output')
  return (
    <aside
      aria-label={t.sidebar.label}
      className="flex w-full shrink-0 flex-col border-line bg-surface lg:w-80 lg:border-l"
    >
      <TrackPanel />
      <Tabs
        label={t.sidebar.label}
        value={tab}
        items={ITEMS}
        onChange={setTab}
        className="flex-1"
      />
      <ExportPanel />
    </aside>
  )
}
