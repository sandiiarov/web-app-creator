import { config } from '../../config.ts'
import { boundedFetch } from './bounded-fetch.ts'
import { providerReportedCost } from './cost.ts'
import { LANDING_PAGE_DESIGN_GUIDANCE } from './landing-design-guidance.ts'

/**
 * Dedicated planner LLM call. Runs BEFORE the landing-page agent stream: takes
 * the user request (+ attachment/scrape context) and returns a structured plan.
 * The design guidance (`LANDING_PAGE_DESIGN_GUIDANCE`) is THIS call's system
 * prompt — front and center, with the full context budget spent on design
 * reasoning — instead of being buried in the agent's first user message (which
 * the agent could ignore, producing the same generic output every time).
 *
 * Flow: planner → `actions` streamed to the UI (PlanBlock), `plan` becomes the
 * agent's user message; the agent then implements it via read/find/edit. The
 * planner owns design; the agent owns execution.
 */

interface ChatCompletionChoice {
  message?: { content?: null | string }
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[]
  error?: { code?: number | string; message?: string }
  usage?: {
    completion_tokens?: number
    cost?: number
    estimated_cost?: number
    prompt_tokens?: number
    total_cost?: number
    total_tokens?: number
  }
}

const PLANNER_SYSTEM_PROMPT = [
  "You are the PLANNER for a landing-page build agent. Your ONLY job is to choose an AESTHETIC DIRECTION and a BUILD SEQUENCE for the user's request. You do NOT write code, and you do NOT invent product content.",
  '',
  'ABSOLUTE RULES (never violate):',
  '1. ECHO THE REQUEST VERBATIM: the `plan` field MUST begin with "USER REQUEST:" followed by the user\'s prompt reproduced word-for-word. The build agent ONLY sees your `plan` — if you paraphrase, omit, or alter the request, it cannot build the right page.',
  '2. DO NOT FABRICATE CONTENT: never invent a product name, company, tagline, feature, headline, body copy, metric, testimonial, award, guarantee, price, or ANY content the user did not supply. If the user gave no content, write "content: defer to build agent (scrape reference or ask user)" — do not make it up.',
  '3. AESTHETIC ONLY: the "direction" is ONLY visual — palette (hex), typography (font names), layout logic, motion. Derive it from the product\'s actual domain. It must NOT change what the page is about.',
  '4. STRUCTURE, NOT COPY: the section list names each section and its purpose (e.g. "Hero — product name + promise + primary CTA"), never full written copy.',
  '',
  LANDING_PAGE_DESIGN_GUIDANCE,
  '',
  "Apply the design guidance to pick a fresh, non-generic aesthetic for the user's ACTUAL product. Then respond as STRICT JSON only — no markdown fences, no prose outside the JSON — with exactly this shape:",
  '{"direction":"one sentence: the aesthetic direction + palette + fonts (visual only; does NOT change the product)","actions":["4-8 ordered, short build steps the user will see"],"plan":"Must start with USER REQUEST: followed by the user\'s prompt VERBATIM. Then DIRECTION: the aesthetic direction, exact palette (hex + roles: canvas/surface/text/accent/border), typography (font names + weights + clamp sizes), motion plan. Then SECTIONS: the section list in order, each as name + purpose only. No fabricated product content, copy, metrics, or proof anywhere."}',
  "The `plan` is the build agent's north-star. `actions` is the scannable step list (4-8 items). `direction` is one sentence.",
].join('\n')

export interface PlannerResult {
  actions: string[]
  cost?: number
  direction: string
  ok: boolean
  plan: string
  reason?: string
}

interface ParsedPlan {
  actions: string[]
  direction: string
  plan: string
}

export async function runPlanner(options: {
  model?: string
  prompt: string
  signal?: AbortSignal
}): Promise<PlannerResult> {
  const model = options.model ?? config.openrouter.defaultChatModel
  const fallback: PlannerResult = {
    actions: [],
    direction: '',
    ok: false,
    plan: options.prompt,
  }

  if (!config.openrouter.apiKey) {
    return {
      ...fallback,
      reason:
        'OPENROUTER_API_KEY is not set. Ask the operator to add it before planning.',
    }
  }

  const url = `${config.openrouter.chatApiUrl.replace(/\/+$/, '')}/chat/completions`
  const fetched = await boundedFetch(
    url,
    {
      body: JSON.stringify({
        max_tokens: 8192,
        messages: [
          { content: PLANNER_SYSTEM_PROMPT, role: 'system' },
          { content: options.prompt, role: 'user' },
        ],
        model,
        temperature: 0.7,
      }),
      headers: {
        Authorization: `Bearer ${config.openrouter.apiKey}`,
        'Content-Type': 'application/json',
        'X-OpenRouter-Metadata': 'enabled',
      },
      method: 'POST',
    },
    { label: 'OpenRouter planner', signal: options.signal },
  )
  if (!fetched.ok) {
    return { ...fallback, reason: fetched.reason }
  }
  const response = fetched.response
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return {
      ...fallback,
      reason: `OpenRouter planner error (${response.status}): ${text.slice(0, 200)}`,
    }
  }

  const json = (await response.json()) as ChatCompletionResponse
  if (json.error) {
    return {
      ...fallback,
      reason: `OpenRouter planner error (${json.error.code ?? 'unknown'}): ${json.error.message ?? 'Unknown error'}`,
    }
  }

  const content = json.choices?.[0]?.message?.content?.trim() ?? ''
  const parsed = parsePlannerJson(content)
  if (!parsed) {
    return {
      ...fallback,
      reason: 'Planner did not return valid JSON with a plan and actions.',
    }
  }

  const providerCost = providerReportedCost(json)
  return {
    actions: parsed.actions,
    cost: providerCost > 0 ? providerCost : undefined,
    direction: parsed.direction,
    ok: true,
    plan: parsed.plan,
  }
}

/**
 * Extract the JSON object from the planner response (tolerates markdown fences
 * or surrounding prose) and validate the required `plan` + `actions` fields.
 */
function parsePlannerJson(content: string): null | ParsedPlan {
  if (!content) return null
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(content.slice(start, end + 1))
  } catch {
    return null
  }
  const data = parsed as Partial<ParsedPlan>
  if (typeof data.plan !== 'string' || !data.plan.trim()) return null
  if (!Array.isArray(data.actions) || data.actions.length === 0) return null
  const actions = data.actions
    .map((action) => (typeof action === 'string' ? action.trim() : ''))
    .filter((action) => action.length > 0)
  if (actions.length === 0) return null
  return {
    actions,
    direction: typeof data.direction === 'string' ? data.direction.trim() : '',
    plan: data.plan.trim(),
  }
}
