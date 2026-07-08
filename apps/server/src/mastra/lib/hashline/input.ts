import * as path from 'node:path'

import { HL_FILE_HASH_LENGTH, HL_FILE_PREFIX, HL_FILE_SUFFIX } from './format'
import { parsePatch } from './parser'
import type { Edit, SplitOptions } from './types'

function unquoteHashlinePath(pathText: string): string {
  if (pathText.length < 2) return pathText
  const first = pathText[0]
  const last = pathText[pathText.length - 1]
  if ((first === '"' || first === "'") && first === last)
    return pathText.slice(1, -1)
  return pathText
}

const APPLY_PATCH_PATH_NOISE_RE =
  /^\*{0,3}\s*(?:(?:update|add|delete|move)[^A-Za-z0-9]*(?:file|to)?[^A-Za-z0-9]*:)?\s*\*{0,3}\s*/i

export interface PatchSection {
  fileHash: string | undefined
  lineNum: number
  rawPath: string
  resolvedPath: string
  text: string
}

export interface RawSection {
  fileHash?: string
  path: string
  rawPath: string
}

export class Patch {
  readonly sections: PatchSection[]

  constructor(input: string, cwd?: string) {
    const { sections } = splitPatchInput(input, { cwd })
    this.sections = sections
  }

  parseEdits(sectionIndex: number): { edits: Edit[]; warnings: string[] } {
    const section = this.sections[sectionIndex]
    if (!section) throw new Error(`Section ${sectionIndex} not found`)
    return parsePatch(section.text)
  }
}

export function splitPatchInput(
  input: string,
  options?: SplitOptions,
): { rest: string; sections: PatchSection[] } {
  const lines = input.split('\n')
  const sections: PatchSection[] = []
  let currentSection: null | {
    header: RawSection
    textLines: string[]
    lineNum: number
  } = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    // Try to parse as header
    const rawHeader = tryParseRecoveryHeader(line, options?.cwd)
    if (rawHeader) {
      if (currentSection) {
        sections.push({
          fileHash: currentSection.header.fileHash,
          lineNum: currentSection.lineNum,
          rawPath: currentSection.header.rawPath,
          resolvedPath: currentSection.header.path,
          text: currentSection.textLines.join('\n'),
        })
      }
      currentSection = {
        header: rawHeader,
        lineNum: i + 1,
        textLines: [],
      }
      continue
    }

    if (currentSection) {
      currentSection.textLines.push(line)
    }
  }

  // Flush last section
  if (currentSection) {
    sections.push({
      fileHash: currentSection.header.fileHash,
      lineNum: currentSection.lineNum,
      rawPath: currentSection.header.rawPath,
      resolvedPath: currentSection.header.path,
      text: currentSection.textLines.join('\n'),
    })
  }

  return {
    rest: currentSection ? '' : lines.join('\n'),
    sections,
  }
}

function stripApplyPatchPathNoise(pathText: string): string {
  return pathText.replace(APPLY_PATCH_PATH_NOISE_RE, '')
}

function tryParseRecoveryHeader(line: string, cwd?: string): null | RawSection {
  if (!line.startsWith(HL_FILE_PREFIX) || !line.endsWith(HL_FILE_SUFFIX))
    return null
  const body = stripApplyPatchPathNoise(
    line
      .slice(HL_FILE_PREFIX.length, line.length - HL_FILE_SUFFIX.length)
      .trim(),
  )
  if (body.length === 0) return null

  const trailing = new RegExp(
    `#([0-9A-Fa-f]{${HL_FILE_HASH_LENGTH}})\\s*$`,
  ).exec(body)
  let pathText: string
  let fileHash: string | undefined
  if (trailing !== null) {
    pathText = body.slice(0, trailing.index)
    fileHash = trailing[1]!.toUpperCase()
  } else {
    pathText = body.replace(/\s+$/, '')
  }

  if (pathText.includes('#')) return null
  pathText = unquoteHashlinePath(pathText)

  // Keep the model-facing path text (rawPath) separate from the canonical,
  // resolved absolute path used for filesystem access.
  const cleanPath = cwd ? path.resolve(cwd, pathText) : pathText
  return { fileHash, path: cleanPath, rawPath: pathText }
}
