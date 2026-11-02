import { analyzeTrack, createRenderer, exportVideo } from './adapters'
import { playback } from './playback'
import { IDLE_EXPORT, useAppStore } from './store'

playback.bindPlayingState((playing) => useAppStore.getState().setPlaying(playing))

/** Bumped on every load so a slow analysis of an old file can't overwrite a newer one. */
let loadToken = 0

export async function loadTrack(file: File) {
  const token = ++loadToken
  const store = useAppStore.getState()
  cancelExport()
  if (store.track) URL.revokeObjectURL(store.track.url)

  const url = URL.createObjectURL(file)
  store.setTrack({ file, name: file.name, url, durationSec: null })
  store.setTimeline(null)
  store.setExport(IDLE_EXPORT)
  store.setAnalysis('decoding')

  playback
    .load(url)
    .then((durationSec) => {
      const track = useAppStore.getState().track
      if (token === loadToken && track) useAppStore.getState().setTrack({ ...track, durationSec })
    })
    .catch(() => {})

  try {
    const timeline = await analyzeTrack(file, (phase) => {
      if (token === loadToken) useAppStore.getState().setAnalysis(phase)
    })
    if (token !== loadToken) return
    useAppStore.getState().setTimeline(timeline)
    useAppStore.getState().setAnalysis('ready')
  } catch (error) {
    if (token !== loadToken) return
    console.error(error)
    useAppStore.getState().setAnalysis('error', error instanceof Error ? error.message : null)
  }
}

let exportAbort: AbortController | null = null

export async function startExport() {
  const { timeline, output, setExport } = useAppStore.getState()
  if (!timeline || exportAbort) return
  playback.pause()
  const abort = (exportAbort = new AbortController())
  setExport({ status: 'running', progress: 0, error: null })
  let lastPushed = 0
  try {
    const blob = await exportVideo({
      timeline,
      output,
      createRenderer,
      signal: abort.signal,
      onProgress: (progress) => {
        // Throttle store writes to whole percents.
        if (progress - lastPushed >= 0.01 || progress === 1) {
          lastPushed = progress
          setExport({ progress })
        }
      },
    })
    setExport({ status: 'done', progress: 1 })
    if (blob)
      downloadBlob(blob, `${baseName(useAppStore.getState().track?.name)}.${output.container}`)
  } catch (error) {
    if (abort.signal.aborted) setExport({ status: 'cancelled' })
    else {
      console.error(error)
      setExport({ status: 'error', error: error instanceof Error ? error.message : null })
    }
  } finally {
    if (exportAbort === abort) exportAbort = null
  }
}

export function cancelExport() {
  exportAbort?.abort()
  exportAbort = null
}

function baseName(name = 'video'): string {
  return name.replace(/\.[^.]+$/, '') || 'video'
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
