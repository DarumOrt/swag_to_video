import { CompatBanner } from './components/CompatBanner'
import { Preview } from './components/Preview'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { Transport } from './components/Transport'
import { useShortcuts } from './useShortcuts'

export function App() {
  useShortcuts()
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <CompatBanner />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="flex min-h-[60vh] min-w-0 flex-1 flex-col lg:min-h-0">
          <Preview />
          <Transport />
        </main>
        <Sidebar />
      </div>
    </div>
  )
}
