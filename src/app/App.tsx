// Placeholder shell from the scaffold. Owned by the frontend session.
export function App() {
  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
  const webCodecs = typeof VideoEncoder !== 'undefined'
  const webGpu = typeof navigator !== 'undefined' && 'gpu' in navigator

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">SwagToVideo</h1>
      <p className="text-neutral-400">Каркас проекта. Интерфейс появится на вехе 1.</p>
      <ul className="space-y-1 text-sm text-neutral-300">
        <li>Cross-origin isolation: {isolated ? 'да' : 'нет'}</li>
        <li>WebCodecs: {webCodecs ? 'да' : 'нет'}</li>
        <li>WebGPU: {webGpu ? 'да' : 'нет'}</li>
      </ul>
    </main>
  )
}
