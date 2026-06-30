import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const DEFAULT_CONTEXT = 0;
const DEFAULT_LIMIT = 100;
const MAX_LINE_LENGTH = 500;
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

export { createGrepTool };
