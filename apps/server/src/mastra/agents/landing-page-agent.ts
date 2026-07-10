import { Agent, type Agent as AgentType } from '@mastra/core/agent'
import type { Mastra } from '@mastra/core/mastra'
import { design } from '@workspace/agent-skills'

import { config } from '../../config.ts'
import { createHtmlStore, type HtmlStore } from '../lib/html-store.ts'
import { openrouterModel } from '../lib/openrouter-model.ts'
import {
  createLandingTools,
  type RequestBrowserScreenshot,
} from '../tools/landing-tools.ts'

/**
 * Pi-style system prompt: one-sentence role (names capabilities) → concise
 * guidelines. Nothing else is inlined — tool descriptions travel via the `tools`
 * param (function-calling), and the `design` skill is discovered via its
 * name+description injected by Mastra's `SkillsProcessor` (then loaded with
 * `skill`/`skill_read`). Don't duplicate either here.
 */
export const LANDING_AGENT_INSTRUCTIONS = [
  'You are a landing-page design agent. You build and refine a single self-contained project HTML document by scraping reference brands, reading and editing the HTML, generating imagery, and taking screenshots.',
  '',
  '- Build incrementally: scaffold the shell, then add design tokens, then fill one section at a time. Never emit a full finished page in a single edit (the output cap truncates mid-generation).',
  '- For fix and refinement requests, make the smallest change that satisfies the request. Do not redesign or regenerate sections the user did not mention.',
  '- Derive color from scraped brand assets, imagery, and product category (`scrape.branding.colors`, `scrape.imageOcr.text`); do not default to warm cream/orange/terracotta as the anti-AI palette, and vary color lanes across redesigns.',
  '- Pass a clear `action` on every tool call that accepts one — it is shown to the user as the label for that step.',
  '- Be concise and reply in the same language as the latest user prompt (English when English or ambiguous). Do not echo internal tool transcripts such as "Tool read done", "Action:", "Detail:", or "Result:" — the UI renders tool status separately.',
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
