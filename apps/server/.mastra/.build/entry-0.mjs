import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { MastraCompositeStore } from '@mastra/core/storage';
import { DuckDBStore } from '@mastra/duckdb';
import { LibSQLStore } from '@mastra/libsql';
import { PinoLogger } from '@mastra/loggers';
import { Observability, SensitiveDataFilter, MastraStorageExporter } from '@mastra/observability';
import { env } from 'node:process';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSkill } from '@mastra/core/skills';

"use strict";
const DEFAULT_BASETEN_MODEL_ID = "zai-org/GLM-5.2";
const DEFAULT_BASETEN_API_URL = "https://inference.baseten.co/v1";
function createConfigFromEnv(source) {
  return {
    baseten: {
      apiKey: requiredEnv(source, "BASETEN_API_KEY"),
      defaultModel: optionalEnv(source, "BASETEN_MODEL") ?? DEFAULT_BASETEN_MODEL_ID,
      url: optionalEnv(source, "BASETEN_API_URL") ?? DEFAULT_BASETEN_API_URL
    },
    clientOrigin: optionalEnv(source, "CLIENT_ORIGIN") ?? "*",
    host: optionalEnv(source, "HOST") ?? "0.0.0.0",
    mastra: {
      platformAccessToken: optionalEnv(source, "MASTRA_PLATFORM_ACCESS_TOKEN"),
      projectId: optionalEnv(source, "MASTRA_PROJECT_ID")
    },
    port: parsePort(optionalEnv(source, "PORT") ?? "3001")
  };
}
function optionalEnv(source, name) {
  const value = source[name]?.trim();
  return value ? value : void 0;
}
function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }
  return port;
}
function requiredEnv(source, name) {
  const value = source[name];
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

"use strict";
const config = createConfigFromEnv(env);

"use strict";
function basetenModel(modelId = config.baseten.defaultModel) {
  return {
    apiKey: config.baseten.apiKey,
    id: `baseten/${modelId}`,
    url: config.baseten.url
  };
}

"use strict";
const PLACEHOLDER_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Untitled</title>
  </head>
  <body>
    <main>
      <p>Your landing page will appear here.</p>
    </main>
  </body>
</html>
`;
function createHtmlStore(initial) {
  let html = initial ?? PLACEHOLDER_INDEX_HTML;
  return {
    get() {
      return html;
    },
    reset(seed) {
      html = seed ?? PLACEHOLDER_INDEX_HTML;
    },
    set(next) {
      html = next;
      return Buffer.byteLength(next, "utf8");
    }
  };
}

"use strict";
function applyEdit(currentHtml, oldText, newText) {
  const { text } = stripBom(currentHtml);
  const normalizedContent = normalizeToLF(text);
  const { newContent } = applyEditsToNormalizedContent(normalizedContent, [
    { newText, oldText }
  ]);
  return newContent;
}
function applyEditsToNormalizedContent(normalizedContent, edits) {
  const normalizedEdits = edits.map((edit) => ({
    newText: normalizeToLF(edit.newText),
    oldText: normalizeToLF(edit.oldText)
  }));
  for (let i = 0; i < normalizedEdits.length; i++) {
    if (normalizedEdits[i].oldText.length === 0) {
      throw getEmptyOldTextError(i, normalizedEdits.length);
    }
  }
  const initialMatches = normalizedEdits.map(
    (edit) => fuzzyFindText(normalizedContent, edit.oldText)
  );
  const usedFuzzyMatch = initialMatches.some((match) => match.usedFuzzyMatch);
  const replacementBaseContent = usedFuzzyMatch ? normalizeForFuzzyMatch(normalizedContent) : normalizedContent;
  const matchedEdits = [];
  for (let i = 0; i < normalizedEdits.length; i++) {
    const edit = normalizedEdits[i];
    const matchResult = fuzzyFindText(replacementBaseContent, edit.oldText);
    if (!matchResult.found) {
      throw getNotFoundError(i, normalizedEdits.length);
    }
    const occurrences = countOccurrences(replacementBaseContent, edit.oldText);
    if (occurrences > 1) {
      throw getDuplicateError(i, normalizedEdits.length, occurrences);
    }
    matchedEdits.push({
      editIndex: i,
      matchIndex: matchResult.index,
      matchLength: matchResult.matchLength,
      newText: edit.newText
    });
  }
  matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex);
  for (let i = 1; i < matchedEdits.length; i++) {
    const previous = matchedEdits[i - 1];
    const current = matchedEdits[i];
    if (previous.matchIndex + previous.matchLength > current.matchIndex) {
      throw new Error(
        `edits[${previous.editIndex}] and edits[${current.editIndex}] overlap. Merge them into one edit or target disjoint regions.`
      );
    }
  }
  const baseContent = normalizedContent;
  const newContent = usedFuzzyMatch ? applyReplacementsPreservingUnchangedLines(
    normalizedContent,
    replacementBaseContent,
    matchedEdits
  ) : applyReplacements(replacementBaseContent, matchedEdits);
  if (baseContent === newContent) {
    throw getNoChangeError(normalizedEdits.length);
  }
  return { baseContent, newContent };
}
function applyReplacements(content, replacements, offset = 0) {
  let result = content;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const replacement = replacements[i];
    const matchIndex = replacement.matchIndex - offset;
    result = result.substring(0, matchIndex) + replacement.newText + result.substring(matchIndex + replacement.matchLength);
  }
  return result;
}
function applyReplacementsPreservingUnchangedLines(originalContent, baseContent, replacements) {
  const originalLines = splitLinesWithEndings(originalContent);
  const baseLines = getLineSpans(baseContent);
  if (originalLines.length !== baseLines.length) {
    throw new Error(
      "Cannot preserve unchanged lines because the base content has a different line count."
    );
  }
  const groups = [];
  const sortedReplacements = [...replacements].sort(
    (a, b) => a.matchIndex - b.matchIndex
  );
  for (const replacement of sortedReplacements) {
    const range = getReplacementLineRange(baseLines, replacement);
    const current = groups[groups.length - 1];
    if (current && range.startLine < current.endLine) {
      current.endLine = Math.max(current.endLine, range.endLine);
      current.replacements.push(replacement);
      continue;
    }
    groups.push({ ...range, replacements: [replacement] });
  }
  let originalLineIndex = 0;
  let result = "";
  for (const group of groups) {
    result += originalLines.slice(originalLineIndex, group.startLine).join("");
    const groupStartOffset = baseLines[group.startLine].start;
    const groupEndOffset = baseLines[group.endLine - 1].end;
    result += applyReplacements(
      baseContent.slice(groupStartOffset, groupEndOffset),
      group.replacements,
      groupStartOffset
    );
    originalLineIndex = group.endLine;
  }
  result += originalLines.slice(originalLineIndex).join("");
  return result;
}
function countChangedLines(oldContent, newContent) {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const max = Math.max(oldLines.length, newLines.length);
  let changed = 0;
  for (let i = 0; i < max; i++) {
    if (oldLines[i] !== newLines[i]) changed++;
  }
  return changed;
}
function countOccurrences(content, oldText) {
  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzyOldText = normalizeForFuzzyMatch(oldText);
  return fuzzyContent.split(fuzzyOldText).length - 1;
}
function fuzzyFindText(content, oldText) {
  const exactIndex = content.indexOf(oldText);
  if (exactIndex !== -1) {
    return {
      contentForReplacement: content,
      found: true,
      index: exactIndex,
      matchLength: oldText.length,
      usedFuzzyMatch: false
    };
  }
  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzyOldText = normalizeForFuzzyMatch(oldText);
  const fuzzyIndex = fuzzyContent.indexOf(fuzzyOldText);
  if (fuzzyIndex === -1) {
    return {
      contentForReplacement: content,
      found: false,
      index: -1,
      matchLength: 0,
      usedFuzzyMatch: false
    };
  }
  return {
    contentForReplacement: fuzzyContent,
    found: true,
    index: fuzzyIndex,
    matchLength: fuzzyOldText.length,
    usedFuzzyMatch: true
  };
}
function getDuplicateError(editIndex, totalEdits, occurrences) {
  return totalEdits === 1 ? new Error(
    `Found ${occurrences} occurrences of the text. The text must be unique. Provide more context to make it unique.`
  ) : new Error(
    `Found ${occurrences} occurrences of edits[${editIndex}]. Each oldText must be unique. Provide more context.`
  );
}
function getEmptyOldTextError(editIndex, totalEdits) {
  return totalEdits === 1 ? new Error("oldText must not be empty.") : new Error(`edits[${editIndex}].oldText must not be empty.`);
}
function getLineSpans(content) {
  let offset = 0;
  return splitLinesWithEndings(content).map((line) => {
    const span = { end: offset + line.length, start: offset };
    offset = span.end;
    return span;
  });
}
function getNoChangeError(totalEdits) {
  return totalEdits === 1 ? new Error(
    "No changes made. The replacement produced identical content."
  ) : new Error("No changes made. The replacements produced identical content.");
}
function getNotFoundError(editIndex, totalEdits) {
  return totalEdits === 1 ? new Error(
    "Could not find the exact text. The old text must match exactly including all whitespace and newlines."
  ) : new Error(
    `Could not find edits[${editIndex}]. The oldText must match exactly including all whitespace and newlines.`
  );
}
function getReplacementLineRange(lines, replacement) {
  const replacementStart = replacement.matchIndex;
  const replacementEnd = replacement.matchIndex + replacement.matchLength;
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (replacementStart >= line.start && replacementStart < line.end) {
      startLine = i;
      break;
    }
  }
  if (startLine === -1) {
    throw new Error("Replacement range is outside the base content.");
  }
  let endLine = startLine;
  while (endLine < lines.length && lines[endLine].end < replacementEnd) {
    endLine++;
  }
  if (endLine >= lines.length) {
    throw new Error("Replacement range is outside the base content.");
  }
  return { endLine: endLine + 1, startLine };
}
function normalizeForFuzzyMatch(text) {
  return text.normalize("NFKC").split("\n").map((line) => line.trimEnd()).join("\n").replace(/[\u2018\u2019\u201A\u201B]/g, "'").replace(/[\u201C\u201D\u201E\u201F]/g, '"').replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-").replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");
}
function normalizeToLF(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function splitLinesWithEndings(content) {
  return content.match(/[^\n]*\n|[^\n]+/g) ?? [];
}
function stripBom(content) {
  return content.startsWith("\uFEFF") ? { bom: "\uFEFF", text: content.slice(1) } : { bom: "", text: content };
}

"use strict";
function createEditTool(store) {
  return createTool({
    description: "Edit /index.html by replacing oldText with newText. oldText must match exactly (whitespace + newlines) and be unique. Use grep/read first to get exact text. After a successful edit the preview is updated automatically. Always pass an intent describing the change.",
    execute: async ({ newText, oldText }) => {
      const before = store.get();
      const after = applyEdit(before, oldText, newText);
      const bytes = store.set(after);
      const changedLines = countChangedLines(before, after);
      return {
        bytes,
        changedLines,
        html: after,
        ok: true
      };
    },
    id: "edit",
    inputSchema: z.object({
      intent: z.string().describe('Short description of the change (shown to the user), e.g. "swap hero headline to benefit-driven copy"'),
      newText: z.string().describe("Replacement text"),
      oldText: z.string().describe("Exact text to find, including whitespace and newlines")
    }),
    outputSchema: z.object({
      bytes: z.number(),
      changedLines: z.number(),
      html: z.string(),
      ok: z.boolean()
    })
  });
}

"use strict";
const DEFAULT_CONTEXT = 0;
const DEFAULT_LIMIT = 100;
const MAX_LINE_LENGTH = 500;
function grepHtml(content, pattern, options = {}) {
  const contextValue = Math.max(0, options.context ?? DEFAULT_CONTEXT);
  const effectiveLimit = Math.max(1, options.limit ?? DEFAULT_LIMIT);
  const ignoreCase = options.ignoreCase ?? false;
  const literal = options.literal ?? false;
  let regex;
  try {
    regex = new RegExp(
      literal ? pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : pattern,
      ignoreCase ? "i" : ""
    );
  } catch (error) {
    return {
      matchCount: 0,
      matches: [],
      matchLimitReached: false,
      notices: [`Invalid regex: ${error instanceof Error ? error.message : String(error)}`],
      output: "",
      truncatedLines: false
    };
  }
  const lines = normalizeLines(content);
  const matches = [];
  let truncatedLines = false;
  let matchLimitReached = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (regex.test(line)) {
      matches.push({ lineNumber: i + 1, text: line });
      if (matches.length >= effectiveLimit) {
        matchLimitReached = true;
        break;
      }
    }
  }
  const notices = [];
  if (matchLimitReached) {
    notices.push(
      `${effectiveLimit} matches limit reached. Use a larger limit or refine the pattern.`
    );
  }
  if (matches.length === 0) {
    return {
      matchCount: 0,
      matches: [],
      matchLimitReached: false,
      notices: [],
      output: "No matches found",
      truncatedLines: false
    };
  }
  const outputLines = [];
  for (const match of matches) {
    if (contextValue === 0) {
      const { text, wasTruncated } = truncateLine(match.text);
      if (wasTruncated) truncatedLines = true;
      outputLines.push(`${match.lineNumber}: ${text}`);
    } else {
      const start = Math.max(1, match.lineNumber - contextValue);
      const end = Math.min(lines.length, match.lineNumber + contextValue);
      for (let current = start; current <= end; current++) {
        const lineText = lines[current - 1] ?? "";
        const { text, wasTruncated } = truncateLine(lineText);
        if (wasTruncated) truncatedLines = true;
        const isMatchLine = current === match.lineNumber;
        outputLines.push(isMatchLine ? `${current}: ${text}` : `${current}- ${text}`);
      }
    }
  }
  if (truncatedLines) {
    notices.push(`Some lines truncated to ${MAX_LINE_LENGTH} chars. Use read to see full lines.`);
  }
  return {
    matchCount: matches.length,
    matches,
    matchLimitReached,
    notices,
    output: notices.length ? `${outputLines.join("\n")}

[${notices.join(". ")}]` : outputLines.join("\n"),
    truncatedLines
  };
}
function normalizeLines(content) {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}
function truncateLine(line) {
  if (line.length <= MAX_LINE_LENGTH) {
    return { text: line, wasTruncated: false };
  }
  return { text: `${line.slice(0, MAX_LINE_LENGTH)}... [truncated]`, wasTruncated: true };
}

"use strict";
function createGrepTool(store) {
  return createTool({
    description: "Search /index.html for a pattern. Regex by default; set literal=true for plain strings. Returns matching lines with 1-indexed line numbers and optional context lines. Use this to find exact text before editing. Always pass an intent describing the search.",
    execute: async ({ context, ignoreCase, limit, literal, pattern }) => {
      const result = grepHtml(store.get(), pattern, {
        context,
        ignoreCase,
        limit,
        literal
      });
      return {
        matchCount: result.matchCount,
        matchLimitReached: result.matchLimitReached,
        text: result.output,
        truncatedLines: result.truncatedLines
      };
    },
    id: "grep",
    inputSchema: z.object({
      context: z.number().int().nonnegative().optional().describe("Lines of context before/after each match (default 0)"),
      ignoreCase: z.boolean().optional().describe("Case-insensitive (default false)"),
      intent: z.string().describe('Short reason for searching (shown to the user), e.g. "locate the CTA button markup"'),
      limit: z.number().int().positive().optional().describe("Max matches to return (default 100)"),
      literal: z.boolean().optional().describe("Treat pattern as a literal string, not regex (default false)"),
      pattern: z.string().describe("Search pattern (regex by default)")
    }),
    outputSchema: z.object({
      matchCount: z.number(),
      matchLimitReached: z.boolean(),
      text: z.string(),
      truncatedLines: z.boolean()
    })
  });
}

"use strict";
function createReadTool(store) {
  return createTool({
    description: "Read the current /index.html. Returns numbered lines (1-indexed). Use offset/limit to page through a long file. Always pass an intent describing why you are reading.",
    execute: async ({ limit, offset }) => {
      const lines = store.get().replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
      const start = Math.max(1, offset ?? 1);
      const end = Math.min(lines.length, start - 1 + (limit ?? 2e3));
      const slice = lines.slice(start - 1, end);
      const width = String(end).length;
      const text = slice.map((line, i) => `${String(start + i).padStart(width, " ")}  ${line}`).join("\n");
      return {
        lines: end - start + 1,
        text: `${text}

(showing lines ${start}-${end} of ${lines.length})`,
        totalLines: lines.length
      };
    },
    id: "read",
    inputSchema: z.object({
      intent: z.string().describe('Short reason for reading (shown to the user), e.g. "review current hero markup"'),
      limit: z.number().int().positive().optional().describe("Max lines to return (default 2000)"),
      offset: z.number().int().positive().optional().describe("First line number to return, 1-indexed (default 1)")
    }),
    outputSchema: z.object({
      lines: z.number(),
      text: z.string(),
      totalLines: z.number()
    })
  });
}

"use strict";
function loadReferenceMap(root) {
  const dir = join(root, "references");
  const map = {};
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      map[file] = readFileSync(join(dir, file), "utf8");
    }
  } catch {
  }
  return map;
}
function loadSkillInstructions(root) {
  try {
    return readFileSync(join(root, "SKILL.md"), "utf8");
  } catch {
    return "";
  }
}
function resolveDesignRoot() {
  const home = homedir();
  const candidates = [
    resolve(home, ".pi/agent/skills/design"),
    resolve(process.cwd(), ".pi/skills/design")
  ];
  for (const candidate of candidates) {
    try {
      readFileSync(join(candidate, "SKILL.md"));
      return candidate;
    } catch {
    }
  }
  return candidates[0];
}
const DESIGN_ROOT = resolveDesignRoot();
const DESIGN_REFERENCES = loadReferenceMap(DESIGN_ROOT);
const PI_SKILL_BODY = loadSkillInstructions(DESIGN_ROOT);
const designSkill = createSkill({
  description: "Use for every landing-page design decision: building a new page from a prompt, refining layout, color, typography, spacing, motion, voice, responsive behavior, or auditing an existing page. Load the relevant reference before making changes.",
  instructions: [
    "# Landing-page design agent",
    "",
    "You build and refine a single self-contained file: `/index.html`. Every change is an edit to that one file. The file is the only artifact and the only thing the user ever sees.",
    "",
    "## How a turn runs",
    "1. Understand the request. If it is a new page, read the `create` reference first and build from scratch (a sequence of edits starting from the placeholder). If it refines an existing page, `grep`/`read` the current file to find the exact text, then `edit`.",
    "2. Decide \u2014 do not ask for confirmation on a complete prompt. Infer ordinary details and choose the strongest interpretation. Ask only if a truly ambiguous goal would change what gets built.",
    "3. Ship \u2014 apply edits to real markup. No markdown mockups, no describing what you would do. Every turn must leave `/index.html` better than it found it.",
    "",
    "## Design taste (apply always)",
    "These rules are non-negotiable. Load the full reference for any area before working in it.",
    "- **Color**: intentional, accessible palette; never default blue/purple gradients or generic AI rainbow. Define tokens, use them consistently.",
    "- **Typography**: a deliberate type scale; real hierarchy via size/weight, not decoration. Avoid Inter/Geist defaults unless intentional.",
    "- **Layout**: composition follows the work, never habit. Generous whitespace, clear visual rhythm, strong alignment.",
    "- **Spacing**: consistent scale; breathing room; no cramped clusters.",
    "- **Motion**: none unless it earns its place. Default to static. No fade-ins, scale-on-hover, or count-ups without a reason.",
    '- **Voice**: clear, specific, human copy. Cut adjectives and buzzwords. No "powerful", "seamless", "leverage".',
    "- **Responsive**: works from mobile up; test breakpoints; never horizontally scroll on a phone.",
    "- **Surfaces**: restrained borders and shadows; flat by default; depth only where it communicates hierarchy.",
    "- **No rounded corners**: use `border-radius: 0` (or tailwind `rounded-none`). Sharp, architectural corners only.",
    "",
    "## Anti-patterns (never ship these)",
    '- AI-generated smell: generic gradient heroes, glassmorphism, aurora blobs, centered-trio layouts, emoji feature icons, "trusted by" logo strips, 3-card feature grids with outline icons.',
    '- Decoration without purpose: gradients, glows, drop shadows, borders added "to look nice".',
    "- Inconsistent tokens: ad-hoc hex values, mixed spacing units, mismatched corner radii.",
    "- Bloated copy: marketing adjective soup, vague headlines, placeholder Lorem.",
    "",
    "## Tool usage",
    "- `grep` \u2014 find exact text/structure before editing. Always grep first so oldText is unique and exact.",
    "- `read` \u2014 inspect a region of the file when you need surrounding context or line numbers.",
    "- `edit` \u2014 apply a change. oldText must match exactly (whitespace + newlines) and be unique. Pass a clear `intent` for every call \u2014 it is shown to the user.",
    "",
    "## Before you finish",
    "Re-read the file once. Confirm: no rounded corners, no unearned motion, real copy (no Lorem), consistent tokens, responsive, accessible contrast. If any anti-pattern remains, fix it before stopping.",
    "",
    "---",
    "",
    "## Full pi design skill (reference)",
    "Below is the complete pi design skill body. Treat it as authoritative design guidance; ignore the parts about CLI commands (`/design ...`), `.commandcode/design/` reports, and tools that do not exist here (recolor, relayout as separate tools \u2014 fold them into `edit`). The design taste, references, and checklists are directly applicable.",
    "",
    PI_SKILL_BODY
  ].join("\n"),
  name: "design",
  references: DESIGN_REFERENCES
});

"use strict";
const LANDING_AGENT_INSTRUCTIONS = [
  "You are a landing-page design agent. You build and refine a single self-contained file, `/index.html`, using three tools: read, edit, and grep.",
  "",
  "Every turn: understand the request, read/grep the current file to find exact text, apply edits, and leave the page better than you found it. Never produce markdown mockups \u2014 always edit the real file.",
  "",
  "Apply the design skill rigorously. Load its references with skill_read before working in any area (color, typography, layout, motion, voice, responsive). Ship restrained, intentional, accessible design. No rounded corners. No unearned motion.",
  "",
  "Pass a clear `intent` on every tool call \u2014 it is shown to the user as the reason for that step."
].join("\n");
function createLandingPageAgent(store, mastra, modelId = config.baseten.defaultModel) {
  return new Agent({
    id: "landing-page-agent",
    instructions: LANDING_AGENT_INSTRUCTIONS,
    mastra,
    model: basetenModel(modelId),
    name: "Landing Page Agent",
    skills: [designSkill],
    tools: {
      edit: createEditTool(store),
      grep: createGrepTool(store),
      read: createReadTool(store)
    }
  });
}
function createLandingPageAgentConfig(store, modelId = config.baseten.defaultModel) {
  return {
    id: "landing-page-agent",
    instructions: LANDING_AGENT_INSTRUCTIONS,
    model: basetenModel(modelId),
    name: "Landing Page Agent",
    skills: [designSkill],
    tools: {
      edit: createEditTool(store),
      grep: createGrepTool(store),
      read: createReadTool(store)
    }
  };
}
const sharedStore = createHtmlStore();
const landingPageAgentConfig = createLandingPageAgentConfig(sharedStore);

"use strict";
const mastra = new Mastra({
  agents: {
    landingPageAgent: new Agent(landingPageAgentConfig)
  },
  logger: new PinoLogger({
    level: "info",
    name: "landing-page-agent"
  }),
  observability: new Observability({
    configs: {
      default: {
        exporters: [new MastraStorageExporter()],
        serviceName: "landing-page-agent",
        spanOutputProcessors: [new SensitiveDataFilter()]
      }
    }
  }),
  storage: new MastraCompositeStore({
    default: new LibSQLStore({
      id: "landing-page-agent",
      url: "file:./mastra.db"
    }),
    domains: {
      observability: new DuckDBStore({
        path: "mastra.duckdb"
      }).observability
    },
    id: "landing-page-agent"
  })
});

export { mastra };
