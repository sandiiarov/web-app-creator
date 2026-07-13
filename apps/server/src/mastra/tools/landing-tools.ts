import type { Filesystem } from '../lib/hashline/fs.ts'
import { HtmlStoreFilesystem } from '../lib/hashline/html-store-filesystem.ts'
import { createSnapshotStore } from '../lib/hashline/snapshot-store.ts'
import type { SnapshotStore } from '../lib/hashline/snapshots.ts'
import type { HtmlStore } from '../lib/html-store.ts'
import { createEditTool } from './edit.ts'
import { createFindTool } from './find.ts'
import { createGenerateImageTool } from './generate-image.ts'
import { createPlanTool } from './plan.ts'
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
  | ReturnType<typeof createPlanTool>
  | ReturnType<typeof createReadTool>
  | ReturnType<typeof createScrapeTool>
  | ReturnType<typeof createScreenshotTool>

interface LandingToolContext {
  baseUrl: string
  captureProjectSelector?: RequestProjectScreenshot
  fs: Filesystem
  imageModel?: string
  projectId?: string
  snapshots: SnapshotStore
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
    'plan',
    'Use `plan` FIRST for any new page, redesign, or substantial change. Provide `actions` (the ordered implementation steps the user sees) and `request` (the expanded brief). After it returns, implement with `edit`/`generate_image`. A focused single fix or tweak may skip it.',
    () => createPlanTool(),
  ),
  tool(
    'scrape',
    'Use `scrape` when the user gives a reference URL or asks you to match a brand. It returns markdown, links, image URLs, branding, and `imageOcr` — the OCR + visual transcript for all scraped images. Use `imageOcr.text` directly. Prefer relevant URLs from `images` for source-site content such as portraits, logos, screenshots, newsletter art, and video thumbnails; do not hotlink arbitrary image URLs that were not returned by `scrape`. If `images` is empty, say no OCR was possible.',
    ({ projectId, turnId, visionModel }) =>
      createScrapeTool({ projectId, turnId, visionModel }),
  ),
  tool(
    'read',
    'Use `read` to inspect the current project HTML as a hashline section: a `[index.html#TAG]` header (copy the TAG into your next edit) followed by `N:TEXT` rows. Reference those line numbers in edit SWAP/DEL/INS ops.',
    ({ fs, snapshots }) => createReadTool(fs, snapshots),
  ),
  tool(
    'find',
    'Use `find` to locate text in the project HTML before editing. Literal search is the default; set `regex=true` only when needed. Returns a hashline section (`[index.html#TAG]` + `N:TEXT` rows) for matches with optional context; copy the TAG into your next edit.',
    ({ fs, snapshots }) => createFindTool(fs, snapshots),
  ),
  tool(
    'edit',
    'Use `edit` to change the project HTML with `{ action, diff }`. `diff` is hashline DSL: a `[index.html#TAG]` header (TAG from your latest read/find) then `SWAP N.=M:`/`DEL N.=M`/`INS.PRE|POST|HEAD|TAIL N:` ops with `+TEXT` body rows. Line numbers come from read/find and refer to the original file. Touch only lines your read displayed; ranges cover only changed lines (pure additions use INS, never a widened SWAP). For a new draft: `edit({ action: "Create initial page", diff: "[index.html#TAG]\\nINS.HEAD:\\n+<!doctype html>..." })` using a fresh read tag, or scaffold then build up with targeted section edits. On stale-tag rejection, re-read before retrying. The preview updates automatically after a successful edit; the result is concise metadata plus the fresh TAG for your next edit.',
    ({ fs, snapshots }) => createEditTool(fs, snapshots),
  ),
  tool(
    'screenshot',
    'Use `screenshot` after substantial edits or when visual feedback is needed. It renders the current project HTML at three viewport sizes (mobile, tablet, desktop) in one isolated browser session, captures the element matching `selector` with 8px padding around it, and returns OCR plus visual QA notes for layout, text, spacing, contrast, clipping, and responsive issues across all three viewports. The tool accepts only `selector`, and creates no files.',
    ({ captureProjectSelector, visionModel }) =>
      createScreenshotTool(captureProjectSelector, visionModel),
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
    turnId?: string
    visionModel?: string
  } = {},
): Record<string, LandingTool> {
  const fs = new HtmlStoreFilesystem(store)
  const snapshots = createSnapshotStore()
  return Object.fromEntries(
    LANDING_TOOL_DEFINITIONS.map(({ create, id }) => [
      id,
      create({
        baseUrl,
        captureProjectSelector,
        fs,
        imageModel: options.imageModel,
        projectId: options.projectId,
        snapshots,
        store,
        turnId: options.turnId,
        visionModel: options.visionModel,
      }),
    ]),
  )
}
