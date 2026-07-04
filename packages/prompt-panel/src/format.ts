export function formatCostValue(value: number) {
  return value >= 0.01 ? `$${value.toFixed(4)}` : '<$0.01'
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
