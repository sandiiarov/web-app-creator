/**
 * Hashline edit guidance for the landing-page agent. The model edits the
 * single in-memory HTML document (synthetic path {@link HASHLINE_PATH}) via
 * the hashline DSL: a `[path#TAG]` snapshot header copied verbatim from the
 * latest `read`, followed by `SWAP`/`DEL`/`INS` ops with `+TEXT` body rows.
 */

export const HASHLINE_PATH = 'index.html'

export const HASHLINE_SYSTEM_GUIDANCE = `Hashline HTML tool reference:
- \`read({ action?, offset?, limit? })\` returns a \`[index.html#TAG]\` snapshot header followed by \`N:TEXT\` rows. Paging uses 1-based \`offset\` and an optional line \`limit\`.
- \`find({ action?, text, regex?, ignoreCase?, context?, limit? })\` locates a literal string by default and returns the same snapshot-header and numbered-row format around matches.
- \`edit({ action, diff })\` applies a hashline diff anchored to the TAG and line numbers from a recent read/find. The action is a short user-facing label.

Edit operations:
- \`SWAP N.=M:\` replaces original lines N through M with the following body rows.
- \`DEL N.=M\` deletes original lines N through M and has no body.
- \`INS.PRE N:\` and \`INS.POST N:\` insert around original line N; \`INS.HEAD:\` and \`INS.TAIL:\` insert at document boundaries.
- Every inserted body row starts with the DSL marker \`+\`; the marker is removed before writing. \`+\` by itself inserts a blank line.

Example:
\`\`\`text
[index.html#A1B2]
SWAP 10.=11:
+  <section class="proof">
+    <h2>Evidence, clearly framed.</h2>
+  </section>
INS.PRE 24:
+  --color-canvas: #f7f2e8;
\`\`\`

CSS custom properties still use the insertion marker: \`+  --color-canvas: ...\`. A literal line beginning with \`-\` is encoded as \`+-...\`; bare \`-\` rows are not deletion syntax because deletion uses \`DEL\`.

Line numbers refer to the original displayed snapshot and remain fixed between hunks. SWAP ranges cover only replaced lines; pure additions fit INS. Opening and closing HTML tags remain balanced, especially when editing near \`</main>\`, \`</body>\`, or \`</html>\`.

A successful edit returns a fresh \`[index.html#TAG]\` for the next edit. A stale-tag result points to a fresh read/find. Malformed-diff and balance errors describe the correction; resending an identical rejected diff produces the same failure.`

export const HASHLINE_READ_GUIDANCE = `Read the project HTML as a hashline section: a \`[index.html#TAG]\` header (copy the TAG verbatim into your next edit) followed by \`N:TEXT\` rows. Line numbers N come from this output — reference them in edit's SWAP/DEL/INS ops. Use offset/limit to page through large documents.`

export const HASHLINE_FIND_GUIDANCE = `Find text in the project HTML. Returns a hashline section (\`[index.html#TAG]\` header + \`N:TEXT\` rows) for the matching lines and optional context. Copy the TAG into your next edit.`

export const HASHLINE_EDIT_GUIDANCE = `Edit the project HTML with hashline DSL text. The \`diff\` MUST start with the \`[index.html#TAG]\` header copied verbatim from your latest read/find, then ops:
- \`SWAP N.=M:\` then \`+TEXT\` body rows — replace original lines N..M (inclusive).
- \`DEL N.=M\` — delete lines N..M (no body).
- \`INS.PRE N:\` / \`INS.POST N:\` — insert body rows before/after line N; \`INS.HEAD:\` / \`INS.TAIL:\` at the doc start/end.
Each body row is \`+TEXT\` (verbatim; leading whitespace kept; \`+\` alone = blank line). Numbers refer to the ORIGINAL file from your latest read and never shift as hunks apply. Touch only lines your read displayed. Ranges cover ONLY lines whose content changes — never widen over unchanged lines; pure additions use INS, never a widened SWAP. Every successful edit mints a fresh #TAG — anchor the next edit on the edit response or a fresh read. On stale-tag rejection, STOP and re-read before retrying. Pass a top-level \`action\` (one short imperative label for this edit, shown to the user).`
