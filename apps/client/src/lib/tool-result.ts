export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Failed to update preview.'
}
