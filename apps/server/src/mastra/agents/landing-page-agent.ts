import { Agent, type Agent as AgentType } from '@mastra/core/agent'
import type { Mastra } from '@mastra/core/mastra'

import { config } from '../../config.ts'
import { createHtmlStore, type HtmlStore } from '../lib/html-store.ts'
import { openrouterModel } from '../lib/openrouter-model.ts'
import { designSkill } from '../skills/design-skill.ts'
import {
  createLandingTools,
  type RequestBrowserScreenshot,
  LANDING_TOOL_COUNT,
  LANDING_TOOL_GUIDANCE,
  LANDING_TOOL_LIST,
} from '../tools/landing-tools.ts'

const LANDING_AGENT_INSTRUCTIONS = [
  `You are a landing-page design agent. You build and refine a single self-contained project HTML document, using ${LANDING_TOOL_COUNT} tools: ${LANDING_TOOL_LIST}.`,
  '',
  'Every turn: understand the request, use the available tools below, and leave the page better than you found it. Never produce markdown mockups — always edit the real project file.',
  '',
  'Available tool guidance:',
  LANDING_TOOL_GUIDANCE,
  '',
  'Apply the design skill rigorously. Load its references with skill_read before working in any area (color, typography, layout, motion, voice, responsive). Ship restrained, intentional, accessible design. No rounded corners. No unearned motion.',
  '',
  'Color direction: do not default to warm cream/orange/terracotta as the anti-AI palette. Derive color from scraped brand assets, logos, imagery, product category, and user action. When `scrape.branding.colors`, metadata images, or `scrape.imageOcr.text` imply a palette, prioritize those signals unless the user asks for a full rebrand. If no brand color is evident, choose a distinct palette with a specific rationale. Vary color lanes across redesigns; warm editorial is only one possible lane.',
  '',
  'When editing, use one `edit` call with an `edits` array for all related non-overlapping changes. Each edit object is `{ action, from?, to?, code?, insert? }` and carries its own `action` (shown to the user as a separate label per edit). A new draft contains only the placeholder page, so initial page creation is one whole-document edit: `edit({ edits: [{ action: "Create initial page", code: "<!doctype html>..." }] })` (omit from/to). For follow-up edits, read or find anchors first, then set `from` (and `to` for a range) to target the smallest safe region: replace it with `code`, omit `code` to delete it, or set `insert: "before"/"after"` to add code relative to `from`. `from`/`to` are order-insensitive. Never call `edit` with an empty `edits` array, and never put `action` at the call level — it lives on each edit object. Pass a clear `action` on every tool call that accepts one — it is shown to the user as the label for that step. The `screenshot` tool takes an optional `action` (what to inspect — becomes the vision prompt), `selector`, and `viewportSize`.',
  '',
  'User-facing prose must be concise and in the same language as the latest user prompt; if the prompt is English or ambiguous, answer in English. Do not switch languages because of scraped content, OCR text, prior messages, or tool results.',
  '',
  'Never echo internal tool transcripts in assistant text. Do not write lines such as "Tool read done", "Action:", "Detail:", or "Result:" in final prose; tool status is shown separately by the UI. Summarize outcomes naturally instead.',
].join('\n')

/**
 * Build a landing-page agent bound to a specific HTML store.
 *
 * The agent edits one project-scoped anchored HTML store via read/find/edit.
 * The shared `mastra` instance is passed so observability + storage are wired.
 */
export function createLandingPageAgent(
  store: HtmlStore,
  mastra: Mastra,
  baseUrl: string,
  textModel: string = config.openrouter.defaultChatModel,
  requestScreenshot?: RequestBrowserScreenshot,
  options: {
    imageModel?: string
    projectId?: string
    turnId?: string
    visionModel?: string
  } = {},
): AgentType {
  return new Agent({
    id: 'landing-page-agent',
    instructions: LANDING_AGENT_INSTRUCTIONS,
    mastra,
    model: openrouterModel(textModel),
    name: 'Landing Page Agent',
    skills: [designSkill],
    tools: createLandingTools(store, baseUrl, requestScreenshot, options),
  })
}

/**
 * Build a landing-page agent bound to a specific HTML store, without a Mastra
 * reference (used where the caller injects mastra after instantiation).
 */
function createLandingPageAgentConfig(
  store: HtmlStore,
  baseUrl: string,
  textModel: string = config.openrouter.defaultChatModel,
  requestScreenshot?: RequestBrowserScreenshot,
  options: {
    imageModel?: string
    projectId?: string
    turnId?: string
    visionModel?: string
  } = {},
) {
  return {
    id: 'landing-page-agent',
    instructions: LANDING_AGENT_INSTRUCTIONS,
    model: openrouterModel(textModel),
    name: 'Landing Page Agent',
    skills: [designSkill],
    tools: createLandingTools(store, baseUrl, requestScreenshot, options),
  }
}

/**
 * Shared module-scoped store, used by the agent registered on the Mastra
 * instance so Mastra Studio can discover the agent and observe traces.
 * (Production requests build fresh stores via the factory above.)
 */
const sharedStore = createHtmlStore()

/**
 * Config for the shared agent registered on the Mastra instance. Mastra injects
 * itself into the constructed agent, so we don't pass `mastra` here. Uses a
 * placeholder baseUrl — Studio requests don't need real image URLs.
 */
export const landingPageAgentConfig = createLandingPageAgentConfig(
  sharedStore,
  'http://localhost:3001',
)
