import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

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

export { createEditTool };
