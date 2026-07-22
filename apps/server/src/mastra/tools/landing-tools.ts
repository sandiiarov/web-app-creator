import { HtmlStoreFilesystem } from '../lib/anchor-edit/html-store-filesystem.ts'
import type { HtmlStore } from '../lib/html-store.ts'
import { createEditTool } from './edit.ts'
import { createFindTool } from './find.ts'
import { createGenerateImageTool } from './generate-image.ts'
import { createReadTool } from './read.ts'
import { createScrapeTool } from './scrape.ts'
import {
  createScreenshotTool,
  type RequestProjectScreenshot,
} from './screenshot.ts'

export type { RequestProjectScreenshot } from './screenshot.ts'

type LandingTool =
  | ReturnType<typeof createEditTool>
  | ReturnType<typeof createFindTool>
  | ReturnType<typeof createGenerateImageTool>
  | ReturnType<typeof createReadTool>
  | ReturnType<typeof createScrapeTool>
  | ReturnType<typeof createScreenshotTool>

interface LandingToolContext {
  baseUrl: string
  captureProjectSelector?: RequestProjectScreenshot
  fs: HtmlStoreFilesystem
  imageModel?: string
  projectId?: string
  signal?: AbortSignal
  store: HtmlStore
  turnId?: string
  visionModel?: string
}

interface LandingToolDefinition {
  create: (context: LandingToolContext) => LandingTool
  guidance: string
  id: string
}

function tool(
  id: string,
  guidance: string,
  create: (context: LandingToolContext) => LandingTool,
): LandingToolDefinition {
  return { create, guidance, id }
}

/**
 * Single source of truth for the agent's callable tools (anchor-label engine).
 *
 * To disable a tool, comment out exactly one `tool(...)` line below. The Mastra
 * tool map, the "available tools" list, and the tool-specific instructions all
 * update from this registry.
 */
const LANDING_TOOL_DEFINITIONS = [
  tool(
    'scrape',
    'Use `scrape` when the user gives a reference URL or asks you to match a brand. It returns markdown, links, image URLs, branding, and `imageOcr` — the OCR + visual transcript for all scraped images. Use `imageOcr.text` directly. Prefer relevant URLs from `images` for source-site content such as portraits, logos, screenshots, newsletter art, and video thumbnails; do not hotlink arbitrary image URLs that were not returned by `scrape`. If `images` is empty, say no OCR was possible.',
    ({ projectId, turnId, visionModel }) =>
      createScrapeTool({ projectId, turnId, visionModel }),
  ),
  tool(
    'read',
    "Use `read` to inspect the current project HTML as `<anchor> <text>` labeled lines (one per document line). Use those anchors — never line numbers — as the `start`/`end` of your edit ranges. The whole document is returned; anchors you don't edit stay valid across edits.",
    ({ fs }) => createReadTool(fs),
  ),
  tool(
    'find',
    "Use `find` to locate text in the project HTML before editing. Literal search is the default; set `regex=true` only when needed. Returns matching lines (with optional context) as `<anchor> <text>` rows — use those anchors directly in your next edit's `start`/`end`.",
    ({ fs }) => createFindTool(fs),
  ),
  tool(
    'edit',
    "Use `edit` to change the project HTML with `{ action, edits: [{ start, end, content }] }`. `start`/`end` are anchors from read/find (inclusive span; `start==end` for one line); `content` is the new lines as a single multi-line string (`\\n` between lines; empty string deletes the span). Anchors are stable — reuse any you have seen; the response returns the new `<anchor> <text>` lines it created as a delta. Batch a whole section's changes into ONE call (one `edits` array may carry many ranges). For a new draft, read first, then replace the placeholder span with the full page. If an anchor is reported absent, re-read once and retry.",
    ({ fs }) => createEditTool(fs),
  ),
  tool(
    'screenshot',
    'Use `screenshot` as a FINAL verification/QA step — like running tests or a linter — taken ONCE the page (or the requested change) is complete, not after every edit. Finish all the edits for a task first, then screenshot to confirm layout, text, spacing, contrast, clipping, and responsive behavior. It renders the current project HTML at three viewport sizes (mobile, tablet, desktop) in one isolated browser session, captures the element matching `selector` with 8px padding around it, and returns OCR plus visual QA notes across all three viewports. For a targeted user request (e.g. "change the navigation") you may screenshot once beforehand to assess current state, and once after the change is done — never as a reflex after each intermediate edit. The tool accepts only `selector`, and creates no files.',
    ({ captureProjectSelector, signal, visionModel }) =>
      createScreenshotTool(captureProjectSelector, visionModel, signal),
  ),
  tool(
    'generate_image',
    'Use `generate_image` whenever the landing page would benefit from net-new raster imagery or art-directed visual assets (hero art, editorial photos, product scenes, abstract brand visuals, textures, etc.). Prefer `scrape.images` for faithful source-site imagery; generate new imagery when scraped assets are missing, low quality, legally/visually unsuitable, or when a new concept strengthens the page. It returns a hosted URL such as `http://localhost:3001/images/img-1.jpg`; embed that URL directly in `<img src="...">`. Do not use placeholders or pasted image bytes.',
    ({ baseUrl, imageModel }) => createGenerateImageTool(baseUrl, imageModel),
  ),
] satisfies LandingToolDefinition[]

export function createLandingTools(
  store: HtmlStore,
  baseUrl: string,
  captureProjectSelector?: RequestProjectScreenshot,
  options: {
    imageModel?: string
    projectId?: string
    signal?: AbortSignal
    turnId?: string
    visionModel?: string
  } = {},
): Record<string, LandingTool> {
  const fs = new HtmlStoreFilesystem(store)
  return Object.fromEntries(
    LANDING_TOOL_DEFINITIONS.map(({ create, id }) => [
      id,
      create({
        baseUrl,
        captureProjectSelector,
        fs,
        imageModel: options.imageModel,
        projectId: options.projectId,
        signal: options.signal,
        store,
        turnId: options.turnId,
        visionModel: options.visionModel,
      }),
    ]),
  )
}
