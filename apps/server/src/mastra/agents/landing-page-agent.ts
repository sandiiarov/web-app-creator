import { Agent, type Agent as AgentType } from '@mastra/core/agent'
import type { Mastra } from '@mastra/core/mastra'
import { TokenLimiter } from '@mastra/core/processors'
import { Memory } from '@mastra/memory'

import { config } from '../../config.ts'
import type { OperationScope } from '../../providers/operation-scope.ts'
import type { ProviderTransport } from '../../providers/transport.ts'
import { ANCHOR_SYSTEM_GUIDANCE } from '../lib/anchor-edit/edit-prompt.ts'
import { createHtmlStore, type HtmlStore } from '../lib/html-store.ts'
import type { ImageStore } from '../lib/image-store.ts'
import { openrouterModel } from '../lib/openrouter-model.ts'
import type { ProjectRepository } from '../lib/project-store.ts'
import { SystemMessagesFirstProcessor } from '../lib/system-messages-first.ts'
import {
  createLandingTools,
  type RequestProjectScreenshot,
} from '../tools/landing-tools.ts'

/**
 * Concise system prompt: one-sentence role, the anchor-label quick reference,
 * then working guidelines. Detailed tool schemas travel via the `tools` param.
 */
const LANDING_AGENT_INSTRUCTIONS = [
  'You are a landing-page design agent. You build and refine a single self-contained project HTML document by scraping reference brands, reading and editing the HTML, generating imagery, and taking screenshots.',
  '',
  ANCHOR_SYSTEM_GUIDANCE,
  '',
  "Build exactly what the user asked for. Use real scraped/supplied content (scrape.images, scrape.branding, the user's text); do not invent product content (names, metrics, testimonials, features, copy) that is not in the request or scraped assets — ask the user if essential content is missing. Reserve `screenshot` for a final check once the page or the requested change is complete, like running tests or a linter, not after every edit.",
  '',
  'Working guidelines:',
  '- Start every run with the `plan` tool: write down your approach in free form, always ending with verification (final screenshot review).',
  '- Build incrementally: scaffold the shell, add design tokens, then fill one section at a time. Each edit is a complete logical unit (e.g. one full section), not a single line. A full finished page in one edit is vulnerable to output-cap truncation.',
  '- Fix and refinement requests: make one cohesive edit that fully satisfies the request, batching all related changes — not a sequence of tiny edits. Sections outside the requested surface stay intact.',
  '- `screenshot` is a final verification step, not a per-edit check: complete the build (or the requested change) first, then screenshot to confirm, like running tests or a linter. For a targeted request (e.g. "change the navigation") you may screenshot once beforehand to assess current state, and once after the change is done — never as a reflex after each intermediate edit.',
  '- Derive color from scraped brand assets, imagery, and product category (`scrape.branding.colors`, `scrape.imageOcr.text`).',
  '- Reply concisely in the language of the latest user prompt (English when English or ambiguous). Internal tool transcripts such as "Tool read done", "Action:", "Detail:", and "Result:" stay in the UI instead of the reply.',
].join('\n')

/**
 * Shared Observational Memory for all landing-page agent instances. Each run
 * addresses its project thread (`thread`/`resource` = projectId); background
 * Observer/Reflector agents over the OpenRouter chat model compress growing
 * history into dense observations that replace raw messages in context.
 * Storage resolves from the Mastra instance (LibSQL `mastra.db`).
 * `observeAttachments: false` keeps image parts as text placeholders for the
 * observer — the chat model may not accept image input. Exported so project
 * deletion can drop the project's memory thread.
 */
export function createLandingMemory(
  options: ConstructorParameters<typeof Memory>[0] = {},
): Memory {
  const suppliedObservationalMemory =
    options.options?.observationalMemory &&
    typeof options.options.observationalMemory === 'object'
      ? options.options.observationalMemory
      : {}
  const suppliedObservation =
    suppliedObservationalMemory.observation &&
    typeof suppliedObservationalMemory.observation === 'object'
      ? suppliedObservationalMemory.observation
      : {}
  return new Memory({
    ...options,
    options: {
      ...options.options,
      observationalMemory: {
        ...suppliedObservationalMemory,
        model:
          suppliedObservationalMemory.model ??
          openrouterModel(config.openrouter.defaultChatModel),
        observation: {
          ...suppliedObservation,
          bufferTokens: false,
          observeAttachments: false,
        },
      },
    },
  })
}

/**
 * Build a landing-page agent bound to a specific HTML store.
 *
 * The agent edits one project-scoped HTML store via read/find/edit (hashline DSL).
 * Its runtime-owned `mastra` instance and memory are passed explicitly so
 * observability, storage, and thread history share the same lifecycle.
 */
export function createLandingPageAgent(
  store: HtmlStore,
  mastra: Mastra,
  memory: Memory,
  baseUrl: string,
  options: {
    directImages?: boolean
    imageModel?: string
    imageStore: ImageStore
    operations?: OperationScope
    projectId?: string
    repository: ProjectRepository
    signal?: AbortSignal
    transport?: ProviderTransport
    turnId?: string
    visionModel?: string
  },
  textModel: string = config.openrouter.defaultChatModel,
  captureProjectSelector?: RequestProjectScreenshot,
): AgentType {
  return new Agent({
    id: 'landing-page-agent',
    inputProcessors: buildInputProcessors(),
    instructions: LANDING_AGENT_INSTRUCTIONS,
    mastra,
    memory,
    model: openrouterModel(textModel),
    name: 'Landing Page Agent',
    tools: createLandingTools(store, baseUrl, options, captureProjectSelector),
  })
}

/**
 * Build a landing-page agent bound to a specific HTML store, without a Mastra
 * reference (used where the caller injects mastra after instantiation).
 */
export function createLandingPageAgentConfig(
  store: HtmlStore,
  memory: Memory,
  baseUrl: string,
  options: {
    directImages?: boolean
    imageModel?: string
    imageStore: ImageStore
    operations?: OperationScope
    projectId?: string
    repository: ProjectRepository
    signal?: AbortSignal
    transport?: ProviderTransport
    turnId?: string
    visionModel?: string
  },
  textModel: string = config.openrouter.defaultChatModel,
  captureProjectSelector?: RequestProjectScreenshot,
) {
  return {
    id: 'landing-page-agent',
    inputProcessors: buildInputProcessors(),
    instructions: LANDING_AGENT_INSTRUCTIONS,
    memory,
    model: openrouterModel(textModel),
    name: 'Landing Page Agent',
    tools: createLandingTools(store, baseUrl, options, captureProjectSelector),
  }
}

/**
 * Per-step input token guard: TokenLimiter trims the oldest non-system
 * messages when the conversation estimate exceeds AGENT_CONTEXT_TOKEN_LIMIT,
 * so replayed history + accumulating tool results never exceed the provider's
 * context window mid-run. Disabled when the configured limit is 0.
 * SystemMessagesFirstProcessor always runs last: strict OpenRouter upstreams
 * (vLLM chat templates) 400 on multiple/mid-prompt system messages, so the
 * wire prompt carries exactly one merged leading system message.
 */
function buildInputProcessors() {
  const guard =
    config.agentContextTokenLimit > 0
      ? [new TokenLimiter({ limit: config.agentContextTokenLimit })]
      : []
  return [...guard, new SystemMessagesFirstProcessor()]
}

/**
 * Create the dedicated store used by the agent registered on the Mastra
 * instance so Mastra Studio can discover the agent and observe traces.
 * (Production requests build fresh stores via the factory above.)
 */
export const createLandingStudioStore = createHtmlStore

/**
 * Config for the discoverable agent registered on a Mastra instance. Mastra injects
 * itself into the constructed agent, so we don't pass `mastra` here. Uses a
 * placeholder baseUrl — Studio requests don't need real image URLs.
 */
