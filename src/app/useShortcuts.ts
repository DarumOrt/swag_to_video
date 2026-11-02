import { useEffect } from 'react'
import { playback } from './playback'
import { useAppStore } from './store'

const SEEK_STEP_SEC = 5

/** Keys handled by the focused control itself (buttons, inputs, radios, tabs). */
function ownsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.closest('input, textarea, select, button, [role="radio"], [role="tab"]')) return true
  return false
}

/** Global editor shortcuts: Space — play/pause, ←/→ — seek by 5 s. */
export function useShortcuts() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (ownsKeys(event.target)) return
      const { track, export: exportState } = useAppStore.getState()
      if (!track || exportState.status === 'running') return

      if (event.code === 'Space') {
        event.preventDefault()
        playback.toggle()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        playback.seek(playback.time - SEEK_STEP_SEC)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        playback.seek(playback.time + SEEK_STEP_SEC)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
