/** "m:ss" or "h:mm:ss"; with `tenths`, adds ".d". */
export function formatTime(seconds: number, tenths = false): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const total = tenths ? Math.floor(safe * 10) / 10 : Math.floor(safe)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  const ss = String(s).padStart(2, '0')
  const tail = tenths ? `.${Math.floor((total * 10) % 10)}` : ''
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}${tail}` : `${m}:${ss}${tail}`
}

/** Editable time: "m:ss.cc" (hundredths). */
export function formatTimeInput(seconds: number): string {
  const cs = Math.round(Math.max(seconds, 0) * 100)
  const m = Math.floor(cs / 6000)
  const s = Math.floor(cs / 100) % 60
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`
}

/** Parses "m:ss.cc", "ss.cc" or "ss" (comma also accepted); null when invalid. */
export function parseTimeInput(text: string): number | null {
  const match = /^\s*(?:(\d+):)?(\d{1,2}|\d+)(?:[.,](\d{1,3}))?\s*$/.exec(text)
  if (!match) return null
  const [, min, sec, frac] = match
  const seconds = Number(sec)
  if (min !== undefined && seconds >= 60) return null
  return Number(min ?? 0) * 60 + seconds + (frac ? Number(`0.${frac}`) : 0)
}

/** 1536 → "1,5 КБ" (decimal comma for RU). */
export function formatBytes(bytes: number): string {
  const units = ['Б', 'КБ', 'МБ', 'ГБ']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1
  return `${value.toFixed(digits).replace('.', ',')} ${units[unit]}`
}
