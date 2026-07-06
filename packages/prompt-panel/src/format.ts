export function formatCostValue(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '$0.0000'
  return `$${value.toFixed(4)}`
}

export function formatDuration(ms: number) {
  if (ms < 1000) {
    return `${ms}ms`
  }

  const seconds = ms / 1000

  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  }

  const minutes = Math.floor(seconds / 60)

  return `${minutes}m ${Math.round(seconds % 60)}s`
}
