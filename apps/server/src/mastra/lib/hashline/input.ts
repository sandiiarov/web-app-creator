import * as path from 'node:path'

import {
  HL_FILE_HASH_LENGTH,
  HL_FILE_PREFIX,
  HL_FILE_SUFFIX,
} from './format.ts'
import type { SplitOptions } from './types.ts'

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

interface RawSection {
  fileHash?: string
  path: string
  rawPath: string
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
    const rawHeader = tryParseRecoveryHeader(
      line,
      options?.cwd,
      options?.defaultPath,
    )
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

function tryParseRecoveryHeader(
  line: string,
  cwd?: string,
  defaultPath?: string,
): null | RawSection {
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

  // Tag-only header (`[#TAG]`) has no path text: fall back to the caller's
  // implicit default path so snapshot lookup and storage stay keyed
  // consistently. rawPath stays empty so the emitted header stays tag-only.
  const effectivePath = pathText.length > 0 ? pathText : (defaultPath ?? '')
  // Keep the model-facing path text (rawPath) separate from the canonical,
  // resolved absolute path used for filesystem access.
  const cleanPath = cwd ? path.resolve(cwd, effectivePath) : effectivePath
  return { fileHash, path: cleanPath, rawPath: pathText }
}
