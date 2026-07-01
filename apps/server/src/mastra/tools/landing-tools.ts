import type { HtmlStore } from '../lib/html-store.ts'
import { createEditTool } from './edit.ts'
import { createGenerateImageTool } from './generate-image.ts'
import { createGrepTool } from './grep.ts'
import { createReadTool } from './read.ts'
import { createScrapeTool } from './scrape.ts'

type LandingTool =
  | ReturnType<typeof createEditTool>
  | ReturnType<typeof createGenerateImageTool>
  | ReturnType<typeof createGrepTool>
  | ReturnType<typeof createReadTool>
  | ReturnType<typeof createScrapeTool>

interface LandingToolContext {
  baseUrl: string
  store: HtmlStore
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
    () => createScrapeTool(),
  ),
  tool(
    'read',
    'Use `read` to inspect the current `/index.html` before making exact edits. Copy `rawText` into `edit.edits[].oldText`; `numberedText` is only for navigation.',
    ({ store }) => createReadTool(store),
  ),
  tool(
    'grep',
    'Use `grep` to locate exact text or CSS before editing. Use `rawMatches` or follow up with `read`; do not copy line-numbered output into edits.',
    ({ store }) => createGrepTool(store),
  ),
  tool(
    'edit',
    'Use `edit` to change `/index.html` with Pi-style `edits: [{ oldText, newText }]`. Combine related non-overlapping replacements in one call; each oldText is matched against the original file and must be exact, unique, and as small as possible. After every successful edit the project file is written and the preview updates automatically.',
    ({ store }) => createEditTool(store),
  ),
  tool(
    'generate_image',
    'Use `generate_image` whenever the landing page would benefit from net-new raster imagery or art-directed visual assets (hero art, editorial photos, product scenes, abstract brand visuals, textures, etc.). Prefer `scrape.images` for faithful source-site imagery; generate new imagery when scraped assets are missing, low quality, legally/visually unsuitable, or when a new concept strengthens the page. It returns a hosted URL such as `http://localhost:3001/images/img-1.jpg`; embed that URL directly in `<img src="...">`. Do not use placeholders or pasted image bytes.',
    ({ baseUrl }) => createGenerateImageTool(baseUrl),
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
): Record<string, LandingTool> {
  return Object.fromEntries(
    LANDING_TOOL_DEFINITIONS.map(({ create, id }) => [
      id,
      create({ baseUrl, store }),
    ]),
  )
}
