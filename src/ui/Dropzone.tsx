import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { matchesAccept } from './accept'
import { cn } from './cn'

export interface DropzoneProps {
  /** `accept` attribute for the file picker, e.g. "audio/*". */
  accept: string
  onFile: (file: File) => void
  /** Called when a dropped file does not match `accept`. */
  onReject?: (file: File) => void
  disabled?: boolean
  className?: string
  /** Render prop gets `open()` so the content can include its own "choose file" button. */
  children: (state: { dragging: boolean; open: () => void }) => ReactNode
}

/** Drag & drop target plus a hidden file input. */
export function Dropzone({
  accept,
  onFile,
  onReject,
  disabled,
  className,
  children,
}: DropzoneProps) {
  const [input, setInput] = useState<HTMLInputElement | null>(null)
  const depth = useRef(0)
  const [dragging, setDragging] = useState(false)

  const open = () => input?.click()

  function take(file: File | undefined) {
    if (!file) return
    if (matchesAccept(file, accept)) onFile(file)
    else onReject?.(file)
  }

  function onDragEnter(event: DragEvent) {
    if (disabled) return
    event.preventDefault()
    depth.current += 1
    setDragging(true)
  }
  function onDragLeave() {
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setDragging(false)
  }
  function onDrop(event: DragEvent) {
    event.preventDefault()
    depth.current = 0
    setDragging(false)
    if (!disabled) take(event.dataTransfer.files[0])
  }

  return (
    <div
      data-dragging={dragging || undefined}
      onDragEnter={onDragEnter}
      onDragOver={(event) => {
        if (!disabled) event.preventDefault()
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'rounded-lg border border-dashed border-line-strong',
        'transition-[border-color,background-color] duration-150 ease-out',
        'data-dragging:border-accent data-dragging:bg-accent-soft',
        className,
      )}
    >
      <input
        ref={setInput}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          take(event.currentTarget.files?.[0])
          event.currentTarget.value = ''
        }}
      />
      {children({ dragging, open })}
    </div>
  )
}
