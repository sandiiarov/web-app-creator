import { Agent, type Agent as AgentType } from '@mastra/core/agent'
import type { Mastra } from '@mastra/core/mastra'

import { config } from '../../config.ts'
import { HASHLINE_SYSTEM_GUIDANCE } from '../lib/hashline/edit-prompt.ts'
import { createHtmlStore, type HtmlStore } from '../lib/html-store.ts'
import { openrouterModel } from '../lib/openrouter-model.ts'
import {
  createLandingTools,
  type RequestProjectScreenshot,
} from '../tools/landing-tools.ts'

/**
 * Concise system prompt: one-sentence role, a hashline quick reference, then
 * working guidelines. Detailed tool schemas still travel via the `tools` param.
 */
const LANDING_AGENT_INSTRUCTIONS = [
  'You are a landing-page design agent. You build and refine a single self-contained project HTML document by scraping reference brands, reading and editing the HTML, generating imagery, and taking screenshots.',
  '',
  HASHLINE_SYSTEM_GUIDANCE,
  '',
  "Build exactly what the user asked for. Use real scraped/supplied content (scrape.images, scrape.branding, the user's text); do not invent product content (names, metrics, testimonials, features, copy) that is not in the request or scraped assets — ask the user if essential content is missing. Reserve `screenshot` for a final check once the page or the requested change is complete, like running tests or a linter, not after every edit.",
  '',
  'Working guidelines:',
  '- Build incrementally: scaffold the shell, add design tokens, then fill one section at a time. Each edit is a complete logical unit (e.g. one full section), not a single line. A full finished page in one edit is vulnerable to output-cap truncation.',
  '- Fix and refinement requests: make one cohesive edit that fully satisfies the request, batching all related changes — not a sequence of tiny edits. Sections outside the requested surface stay intact.',
  '- `screenshot` is a final verification step, not a per-edit check: complete the build (or the requested change) first, then screenshot to confirm, like running tests or a linter. For a targeted request (e.g. "change the navigation") you may screenshot once beforehand to assess current state, and once after the change is done — never as a reflex after each intermediate edit.',
  '- Derive color from scraped brand assets, imagery, and product category (`scrape.branding.colors`, `scrape.imageOcr.text`).',
  '- Reply concisely in the language of the latest user prompt (English when English or ambiguous). Internal tool transcripts such as "Tool read done", "Action:", "Detail:", and "Result:" stay in the UI instead of the reply.',
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
  captureProjectSelector?: RequestProjectScreenshot,
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
    tools: createLandingTools(store, baseUrl, captureProjectSelector, options),
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
  captureProjectSelector?: RequestProjectScreenshot,
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
    tools: createLandingTools(store, baseUrl, captureProjectSelector, options),
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
