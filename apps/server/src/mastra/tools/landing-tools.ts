import type { HtmlStore } from '../lib/html-store.ts'
import { createEditTool } from './edit.ts'
import { createFindTool } from './find.ts'
import { createGenerateImageTool } from './generate-image.ts'
import { createReadTool } from './read.ts'
import { createScrapeTool } from './scrape.ts'
import {
  createScreenshotTool,
  type RequestBrowserScreenshot,
} from './screenshot.ts'

export type { RequestBrowserScreenshot } from './screenshot.ts'

type LandingTool =
  | ReturnType<typeof createEditTool>
  | ReturnType<typeof createFindTool>
  | ReturnType<typeof createGenerateImageTool>
  | ReturnType<typeof createReadTool>
  | ReturnType<typeof createScrapeTool>
  | ReturnType<typeof createScreenshotTool>

interface LandingToolContext {
  baseUrl: string
  imageModel?: string
  projectId?: string
  requestScreenshot?: RequestBrowserScreenshot
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
 * Single source of truth for the agent's callable tools.
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
    'Use `read` to inspect the current project HTML as compact `anchor|text` lines. Use the returned anchors in `edit` from/to; do not copy raw HTML snippets.',
    ({ store }) => createReadTool(store),
  ),
  tool(
    'find',
    'Use `find` to locate text or CSS anchors before editing. Literal search is the default; set `regex=true` only when needed. It returns compact `anchor|text` lines with optional context.',
    ({ store }) => createFindTool(store),
  ),
  tool(
    'edit',
    'Use `edit` to change the project HTML with `edits: [{ action, from?, to?, code?, insert? }]`. Set `from`/`to` to target a region; give `code` to replace it or omit `code` to delete it; set `insert: "before"/"after"` to add code relative to `from`. Omit `from`/`to` and give `code` to replace the whole document (initial page). `from`/`to` are order-insensitive. For a new placeholder draft: `edit({ edits: [{ action: "Create initial page", code: "<!doctype html>..." }] })`. Combine related non-overlapping changes in one call. Use `read` or `find` first for follow-up edits, then target the smallest safe regions. Never call `edit` with an empty `edits` array. After every successful edit the project document is written and the preview updates automatically. The edit result is concise metadata, not the full file; use `read` or `find` again before follow-up edits.',
    ({ store }) => createEditTool(store),
  ),
  tool(
    'screenshot',
    'Use `screenshot` after substantial edits or when visual feedback is needed. It asks the browser to render the current project HTML at `viewportSize` (`mobile`, `tablet`, or `desktop`), captures the element matching `selector` with 8px padding around it, and returns OCR plus visual QA notes for layout, text, spacing, contrast, clipping, and responsive issues. The tool accepts only `selector` and `viewportSize`, and creates no files.',
    ({ requestScreenshot, visionModel }) =>
      createScreenshotTool(requestScreenshot, visionModel),
  ),
  tool(
    'generate_image',
    'Use `generate_image` whenever the landing page would benefit from net-new raster imagery or art-directed visual assets (hero art, editorial photos, product scenes, abstract brand visuals, textures, etc.). Prefer `scrape.images` for faithful source-site imagery; generate new imagery when scraped assets are missing, low quality, legally/visually unsuitable, or when a new concept strengthens the page. It returns a hosted URL such as `http://localhost:3001/images/img-1.jpg`; embed that URL directly in `<img src="...">`. Do not use placeholders or pasted image bytes.',
    ({ baseUrl, imageModel }) => createGenerateImageTool(baseUrl, imageModel),
  ),
] satisfies LandingToolDefinition[]

export const LANDING_TOOL_COUNT = LANDING_TOOL_DEFINITIONS.length

export const LANDING_TOOL_GUIDANCE = LANDING_TOOL_DEFINITIONS.map(
  ({ guidance }) => `- ${guidance}`,
).join('\n')

export const LANDING_TOOL_LIST = LANDING_TOOL_DEFINITIONS.map(
  ({ id }) => id,
).join(', ')

export function createLandingTools(
  store: HtmlStore,
  baseUrl: string,
  requestScreenshot?: RequestBrowserScreenshot,
  options: {
    imageModel?: string
    projectId?: string
    turnId?: string
    visionModel?: string
  } = {},
): Record<string, LandingTool> {
  return Object.fromEntries(
    LANDING_TOOL_DEFINITIONS.map(({ create, id }) => [
      id,
      create({
        baseUrl,
        imageModel: options.imageModel,
        projectId: options.projectId,
        requestScreenshot,
        store,
        turnId: options.turnId,
        visionModel: options.visionModel,
      }),
    ]),
  )
}
