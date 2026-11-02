import { describe, expect, it } from 'vitest'
import type { StreamTargetChunk } from 'mediabunny'
import { guardWritable } from './guardWritable'

/** A sink that records what happened to it, like a FileSystemWritableFileStream would. */
function recordingSink() {
  const log: string[] = []
  const stream = new WritableStream<StreamTargetChunk>({
    write: (chunk) => {
      log.push(`write@${chunk.position}:${chunk.data.length}`)
    },
    close: () => {
      log.push('close')
    },
    abort: () => {
      log.push('abort')
    },
  })
  return { stream, log }
}

const chunk = (position: number): StreamTargetChunk => ({
  type: 'write',
  data: new Uint8Array(4),
  position,
})

describe('guardWritable', () => {
  it('forwards writes and commits on close after success', async () => {
    const sink = recordingSink()
    const guarded = guardWritable(sink.stream, () => true)
    const writer = guarded.stream.getWriter()
    await writer.write(chunk(0))
    await writer.write(chunk(4))
    await writer.close()
    expect(sink.log).toEqual(['write@0:4', 'write@4:4', 'close'])
  })

  it('turns close into abort when the export failed', async () => {
    const sink = recordingSink()
    const guarded = guardWritable(sink.stream, () => false)
    const writer = guarded.stream.getWriter()
    await writer.write(chunk(0))
    await writer.close()
    expect(sink.log).toEqual(['write@0:4', 'abort'])
  })

  it('aborts once, and not after a commit', async () => {
    const sink = recordingSink()
    const guarded = guardWritable(sink.stream, () => true)
    await guarded.stream.getWriter().close()
    await guarded.abort()
    expect(sink.log).toEqual(['close'])

    const failed = recordingSink()
    const g2 = guardWritable(failed.stream, () => false)
    await g2.abort()
    await g2.abort()
    expect(failed.log).toEqual(['abort'])
  })
})
