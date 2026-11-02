import type { StreamTargetChunk } from 'mediabunny'

/**
 * Wraps the caller's writable: forwards writes, but on close() commits only when the export
 * succeeded and aborts (discards the file) otherwise.
 */
export function guardWritable(
  target: WritableStream<StreamTargetChunk>,
  succeeded: () => boolean,
): { stream: WritableStream<StreamTargetChunk>; abort: () => Promise<void> } {
  const writer = target.getWriter()
  let done = false
  const abort = async () => {
    if (done) return
    done = true
    await writer.abort().catch(() => {})
  }
  const stream = new WritableStream<StreamTargetChunk>({
    write: (chunk) => writer.write(chunk),
    close: async () => {
      if (!succeeded()) return abort()
      done = true
      await writer.close()
    },
    abort,
  })
  return { stream, abort }
}
