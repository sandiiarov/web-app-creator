export {
  formatCost,
  formatDuration,
  formatTokenUsage,
  LANDING_MODEL_OPTIONS,
} from '@workspace/prompt-panel'

import { LANDING_MODEL_OPTIONS } from '@workspace/prompt-panel'

const MODEL_LABELS = new Map(
  LANDING_MODEL_OPTIONS.map((option) => [option.id, option.label]),
)

/** Human label for a model id, falling back to the raw id. */
export function formatModelLabel(modelId: string): string {
  return MODEL_LABELS.get(modelId) ?? modelId
}

/** Count tokens compactly when usage exists. */
export function formatTokens(total?: number): string {
  if (typeof total !== 'number') return '—'
  return total >= 1000 ? `${(total / 1000).toFixed(1)}k` : String(total)
}
