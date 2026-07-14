/**
 * Hashline format primitives: sigils, separators, regex fragments, and
 * display helpers. These are the single source of truth for the parser, the
 * tokenizer, the prompt, and the formal grammar.
 */
// Note: Cursor type is defined in types.ts; imported by modules that need it.

/** File-section header delimiters: `[path#hash]`. */
export const HL_FILE_PREFIX = '['
export const HL_FILE_SUFFIX = ']'

/** Payload sigil for literal body rows. */
export const HL_PAYLOAD_REPLACE = '+'

/** Hunk-header keyword for concrete line replacement. */
export const HL_REPLACE_KEYWORD = 'SWAP'
/** Hunk-header keyword for concrete line deletion. */
export const HL_DELETE_KEYWORD = 'DEL'
/** Hunk-header keyword for insertion operations. */
export const HL_INSERT_KEYWORD = 'INS'
/** Insert position keyword for inserting before a concrete line. */
export const HL_INSERT_BEFORE = 'PRE'
/** Insert position keyword for inserting after a concrete line. */
export const HL_INSERT_AFTER = 'POST'
/** Insert position keyword for inserting at the start of the file. */
export const HL_INSERT_HEAD = 'HEAD'
/** Insert position keyword for inserting at the end of the file. */
export const HL_INSERT_TAIL = 'TAIL'
/** Hunk-header keyword for block replacement. */
export const HL_REPLACE_BLOCK_KEYWORD = 'SWAP.BLK'
/** Hunk-header keyword for block deletion. */
export const HL_DELETE_BLOCK_KEYWORD = 'DEL.BLK'
/** Hunk-header keyword for insert after block. */
export const HL_INSERT_AFTER_BLOCK_KEYWORD = 'INS.BLK.POST'

export const HL_HEADER_COLON = ':'

/** Separator between a hashline file path and its opaque snapshot tag. */
export const HL_FILE_HASH_SEP = '#'

/** Separator between two line numbers in a range, e.g. `5.=10`. */
export const HL_RANGE_SEP = '.='

/** Separator between a line number and displayed line content in hashline mode. */
const HL_LINE_BODY_SEP = ':'

/** Number of hex characters in a content-derived file-hash tag. */
export const HL_FILE_HASH_LENGTH = 4

// ── Format helpers ─────────────────────────────────────────────────────────

/**
 * Format a hashline section header. Pass a `filePath` for the full
 * `[path#TAG]` form, or `undefined`/empty for the tag-only `[#TAG]` form used
 * by single-file projects (the path is implicit, carried by the tool config).
 */
export function formatHashlineHeader(
  filePath: string | undefined,
  fileHash: string,
): string {
  const pathPart = filePath && filePath.length > 0 ? filePath : ''
  return `${HL_FILE_PREFIX}${pathPart}${HL_FILE_HASH_SEP}${fileHash}${HL_FILE_SUFFIX}`
}

/** Formats a single numbered line as `LINE:TEXT`. */
export function formatNumberedLine(lineNumber: number, line: string): string {
  return `${lineNumber}${HL_LINE_BODY_SEP}${line}`
}

// ── Hash computation ───────────────────────────────────────────────────────

let xxHash32: ((input: string, seed?: number) => number) | null = null

/**
 * Compute the content-derived hash tag. The tag is a 4-hex fingerprint of the
 * whole file's normalized text: any read of byte-identical content mints the
 * same tag, and a follow-up edit anchored at any line validates whenever the
 * live file still hashes to it.
 */
export async function computeFileHash(text: string): Promise<string> {
  const normalized = normalizeFileHashText(text)
  const h32 = await getXxHash32()
  const low16 = h32(normalized, 0) & 0xffff
  return low16.toString(16).padStart(HL_FILE_HASH_LENGTH, '0').toUpperCase()
}

/** Lazily initialize xxhash-wasm and return the h32 function. */
async function getXxHash32(): Promise<
  (input: string, seed?: number) => number
> {
  if (xxHash32) return xxHash32
  const wasm = await import('xxhash-wasm')
  const api = await wasm.default()
  xxHash32 = api.h32
  return xxHash32
}

/** Normalize text before hashing: trim trailing `[ \t\r]` from every line. */
function normalizeFileHashText(text: string): string {
  return text.replace(/[ \t\r]+(?=\n|$)/g, '')
}
