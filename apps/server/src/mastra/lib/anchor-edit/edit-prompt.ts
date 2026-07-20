/**
 * Anchor-label (v2) edit guidance for the landing-page agent — the single
 * version. Edits address lines by stable document anchors (a1, a2, …), not
 * line numbers, via structured tool args:
 * `edit({ edits: [{ start, end, content }] })` — no DSL, no REPLACE keyword.
 */

export const ANCHOR_SYSTEM_GUIDANCE = `Anchor-label HTML tools:
- \`read({ action? })\` returns one line per document line as \`<anchor> <text>\` (anchors are stable labels like \`a1\`, \`a7\`, \`ab3\`; the first line may be a \`@GEN\` generation marker). No line numbers.
- \`find({ action?, text, regex?, ignoreCase?, context?, limit? })\` locates a literal string by default and returns matching lines (with optional context) in the same \`<anchor> <text>\` format.
- \`edit({ action, edits })\` replaces spans by anchor. \`action\` is a short user-facing label; \`edits\` is an array of range-replaces.

Each edit = { start, end, content }:
- \`start\` / \`end\`: anchors (strings, exactly as read shows them, e.g. \`a1\` and \`ad\`) of the first and last line to replace (inclusive). For one line, start == end.
- \`content\`: the new lines as a single multi-line string (use \`\\n\` between lines). Empty string \`""\` deletes the span.
Example — replace one heading and add a section in one call:
  edits: [
    { start: "a7u", end: "a7u", content: "<h1>New headline</h1>" },
    { start: "a10", end: "a11", content: "<body>\\n<section>...</section>\\n</body>" }
  ]

Anchors are STABLE: a line you do not touch keeps its anchor forever, so any anchor you have ever seen is still valid. Only the lines an edit actually inserts get brand-new anchors, and the edit response returns exactly those new \`<anchor> <text>\` lines as a delta — learn them, keep using every other anchor you already know. You almost never need to re-read.

Patterns (anchors come from your read/find):
- Add a section to an empty body: replace the \`<body>\`..\`</body>\` span with \`"<body>\\n<section>…</section>\\n</body>"\`.
- Insert after a line: replace \`a5..a5\` with that line's text, a \`\\n\`, then the new lines.
- Replace a block: replace \`a3..a20\` with the new block (multi-line string).
- Delete: replace \`a3..a5\` with \`""\` (empty string).
Batch several edits in one call; ranges must not overlap.

If an edit reports an anchor is not in the live document (it changed since your read), re-read once, then retry. Keep opening/closing HTML tags balanced.`

export const ANCHOR_READ_GUIDANCE = `Read the project HTML as anchor-labeled lines: \`<anchor> <text>\` per line (optionally a \`@GEN\` marker first). Use these anchors — never line numbers — as the \`start\`/\`end\` of your next edit's ranges. The whole document is returned; anchors you don't edit stay valid across edits.`

export const ANCHOR_FIND_GUIDANCE = `Find text in the project HTML. Returns matching lines (with optional context) as \`<anchor> <text>\` rows. Use those anchors directly in your next edit's \`start\`/\`end\` ranges.`

export const ANCHOR_EDIT_GUIDANCE = `Edit the project HTML by anchor spans. Pass \`edits\`: an array of { start, end, content }, where start/end are anchors from your latest read/find (strings like \`a1\`, \`ad\`; for one line start == end) and content is the new lines as a single multi-line string (\\n between lines; empty string deletes the span). Anchors are stable — untouched lines keep them, so reuse any anchor you have seen. The response returns the new \`<anchor> <text>\` lines it created as a delta; learn them. Batch a whole section's worth of edits in one call; ranges must not overlap. If an anchor is reported absent (document changed), re-read once and retry. Pass a top-level \`action\` (one short imperative label, shown to the user).`
