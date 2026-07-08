/**
 * Hashline edit guidance for the landing-page agent. The model edits the
 * single in-memory HTML document (synthetic path {@link HASHLINE_PATH}) via
 * the hashline DSL: a `[path#TAG]` snapshot header copied verbatim from the
 * latest `read`, followed by `SWAP`/`DEL`/`INS` ops with `+TEXT` body rows.
 */

export const HASHLINE_PATH = 'index.html'

export const HASHLINE_READ_GUIDANCE = `Read the project HTML as a hashline section: a \`[index.html#TAG]\` header (copy the TAG verbatim into your next edit) followed by \`N:TEXT\` rows. Line numbers N come from this output — reference them in edit's SWAP/DEL/INS ops. Use offset/limit to page through large documents.`

export const HASHLINE_FIND_GUIDANCE = `Find text in the project HTML. Returns a hashline section (\`[index.html#TAG]\` header + \`N:TEXT\` rows) for the matching lines and optional context. Copy the TAG into your next edit.`

export const HASHLINE_EDIT_GUIDANCE = `Edit the project HTML with hashline DSL text. The \`diff\` MUST start with the \`[index.html#TAG]\` header copied verbatim from your latest read/find, then ops:
- \`SWAP N.=M:\` then \`+TEXT\` body rows — replace original lines N..M (inclusive).
- \`DEL N.=M\` — delete lines N..M (no body).
- \`INS.PRE N:\` / \`INS.POST N:\` — insert body rows before/after line N; \`INS.HEAD:\` / \`INS.TAIL:\` at the doc start/end.
Each body row is \`+TEXT\` (verbatim; leading whitespace kept; \`+\` alone = blank line). Numbers refer to the ORIGINAL file from your latest read and never shift as hunks apply. Touch only lines your read displayed. Ranges cover ONLY lines whose content changes — never widen over unchanged lines; pure additions use INS, never a widened SWAP. Every successful edit mints a fresh #TAG — anchor the next edit on the edit response or a fresh read. On stale-tag rejection, STOP and re-read before retrying. Pass a top-level \`action\` (one short imperative label for this edit, shown to the user).`
