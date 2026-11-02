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
