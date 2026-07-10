import { Agent, type Agent as AgentType } from '@mastra/core/agent'
import type { Mastra } from '@mastra/core/mastra'
import { design } from '@workspace/agent-skills'

import { config } from '../../config.ts'
import { HASHLINE_SYSTEM_GUIDANCE } from '../lib/hashline/edit-prompt.ts'
import { createHtmlStore, type HtmlStore } from '../lib/html-store.ts'
import { openrouterModel } from '../lib/openrouter-model.ts'
import {
  createLandingTools,
  type RequestBrowserScreenshot,
} from '../tools/landing-tools.ts'

/**
 * Concise system prompt: one-sentence role, a hashline quick reference, then
 * working guidelines. Detailed tool schemas still travel via the `tools` param;
 * the quick reference is intentionally repeated here because live traces showed
 * malformed CSS insertion rows and an unbalanced closing-tag edit. The `design`
 * skill remains discovered through Mastra's `SkillsProcessor`.
 */
export const LANDING_AGENT_INSTRUCTIONS = [
  'You are a landing-page design agent. You build and refine a single self-contained project HTML document by scraping reference brands, reading and editing the HTML, generating imagery, and taking screenshots.',
  '',
  HASHLINE_SYSTEM_GUIDANCE,
  '',
  'Working guidelines:',
  '- Build incrementally: scaffold the shell, add design tokens, then fill one section at a time. A full finished page in one edit is vulnerable to output-cap truncation.',
  '- Fix and refinement requests use the smallest change that satisfies the request. Sections outside the requested surface stay intact.',
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
    skills: [design],
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
    skills: [design],
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
