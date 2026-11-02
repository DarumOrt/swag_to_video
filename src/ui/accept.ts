/** Checks a file against an `<input accept>` string ("audio/*,.flac"). */
export function matchesAccept(file: Pick<File, 'name' | 'type'>, accept: string): boolean {
  return accept.split(',').some((rule) => {
    const pattern = rule.trim().toLowerCase()
    if (!pattern) return false
    if (pattern.startsWith('.')) return file.name.toLowerCase().endsWith(pattern)
    if (pattern.endsWith('/*')) return file.type.startsWith(pattern.slice(0, -1))
    return file.type === pattern
  })
}
