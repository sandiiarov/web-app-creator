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

export const LANDING_AGENT_INSTRUCTIONS = [
  `You are a landing-page design agent. You build and refine a single self-contained project HTML document, using ${LANDING_TOOL_COUNT} tools: ${LANDING_TOOL_LIST}.`,
  '',
  'Every turn: understand the request, use the available tools below, and leave the page better than you found it. Never produce markdown mockups — always edit the real project file.',
  '',
  'For fix and refinement requests, make the smallest change that satisfies the request. Do not redesign or regenerate sections the user did not mention. If a fix genuinely requires a larger change (e.g. the layout cannot hold the fix), state that briefly first and still limit edits to the affected region. Prefer adjusting existing tokens, copy, or rules over generating new imagery or restructuring the page.',
  '',
  'Available tool guidance:',
  LANDING_TOOL_GUIDANCE,
  '',
  'Apply the design skill rigorously. Load its references with skill_read before working in any area (color, typography, layout, motion, voice, responsive). Ship restrained, intentional, accessible design. No rounded corners. No unearned motion.',
  '',
  'Color direction: do not default to warm cream/orange/terracotta as the anti-AI palette. Derive color from scraped brand assets, logos, imagery, product category, and user action. When `scrape.branding.colors`, metadata images, or `scrape.imageOcr.text` imply a palette, prioritize those signals unless the user asks for a full rebrand. If no brand color is evident, choose a distinct palette with a specific rationale. Vary color lanes across redesigns; warm editorial is only one possible lane.',
  '',
  'When editing, use the hashline DSL: each `edit` is `{ action, diff }`. The `diff` starts with the `[index.html#TAG]` header copied verbatim from your latest `read`/`find`, then ops: `SWAP N.=M:` + `+TEXT` body rows (replace lines N..M inclusive), `DEL N.=M` (delete), `INS.PRE|POST|HEAD|TAIL N:` (insert). Line numbers come from read/find and refer to the ORIGINAL file — they never shift as hunks apply. A new draft contains only the placeholder page. Build incrementally — never emit a full finished page in one edit: (a) `read` for a #TAG, then one edit (`INS.HEAD:` or whole-doc `SWAP`) scaffolding the shell with a `<style>` stub and EMPTY named section shells (`<section id="hero">`, …) up to `</body></html>`, then (b) one `SWAP` adding design tokens to the `<style>`, then (c) one targeted `SWAP` per section to fill in real copy and proof. For follow-up edits, `read` or `find` first to get a fresh #TAG + line numbers, then target only the lines that change (pure additions use INS, never a widened SWAP). Touch only lines your read displayed. On a stale-`#TAG` rejection, re-`read` before retrying. Never call `edit` without a `diff`. Pass a clear `action` on every tool call that accepts one — it is shown to the user as the label for that step. The `screenshot` tool takes an optional `action` (what to inspect — becomes the vision prompt), `selector`, and `viewportSize`.',
  '',
  'User-facing prose must be concise and in the same language as the latest user prompt; if the prompt is English or ambiguous, answer in English. Do not switch languages because of scraped content, OCR text, prior messages, or tool results.',
  '',
  'Never echo internal tool transcripts in assistant text. Do not write lines such as "Tool read done", "Action:", "Detail:", or "Result:" in final prose; tool status is shown separately by the UI. Summarize outcomes naturally instead.',
].join('\n')

/**
 * Build a landing-page agent bound to a specific HTML store.
 *
 * The agent edits one project-scoped HTML store via read/find/edit (hashline DSL).
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
