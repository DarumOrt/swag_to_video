import { useId, useState } from 'react'
import { lyricsToText } from '@/lyrics'
import { Button } from '@/ui'
import { t } from '../../i18n'
import { applyPastedText, setPasteOpen } from '../../lyricsActions'
import { useLyricsStore } from '../../lyricsStore'
import { useAppStore } from '../../store'

export function PasteForm() {
  const id = useId()
  const [text, setText] = useState(() => {
    const lyrics = useAppStore.getState().timeline?.lyrics
    return lyrics ? lyricsToText(lyrics) : ''
  })
  const hasRecognition = useLyricsStore((state) => state.recognized !== null)

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        applyPastedText(text)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setPasteOpen(false)
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) applyPastedText(text)
      }}
    >
      <label htmlFor={id} className="text-xs text-muted">
        {t.lyrics.pasteHint}
      </label>
      <textarea
        id={id}
        value={text}
        autoFocus
        spellCheck={false}
        placeholder={t.lyrics.pastePlaceholder}
        onChange={(event) => setText(event.currentTarget.value)}
        className="min-h-40 flex-1 resize-none rounded-md border border-line-strong bg-bg p-3 text-[13px] leading-6 text-fg placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={!text.trim()}>
          {hasRecognition ? t.lyrics.pasteApplyAlign : t.lyrics.pasteApply}
        </Button>
        <Button variant="ghost" onClick={() => setPasteOpen(false)}>
          {t.lyrics.cancel}
        </Button>
        <span className="ml-auto text-2xs text-subtle">Ctrl + Enter</span>
      </div>
    </form>
  )
}
