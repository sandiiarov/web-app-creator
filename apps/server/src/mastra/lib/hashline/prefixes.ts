const HL_PREFIX_RE = /^\s*(?:>>>|>>)?\s*(?:[+*-]\s*)?\d+:/

export function stripOneLeadingHashlinePrefix(line: string): string {
  return line.replace(HL_PREFIX_RE, '')
}
