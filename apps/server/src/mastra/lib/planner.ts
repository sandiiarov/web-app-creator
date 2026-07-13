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
  LANDING_PAGE_DESIGN_GUIDANCE,
  '',
  'You are the PLANNER for a landing-page build agent. Given the user request (and any scraped/attachment context), produce a concrete design plan that the build agent will implement verbatim. You do NOT write code — you commit to a design direction and a build sequence.',
  '',
  'First run the "Discover a unique direction" process from the guidance above: invent a specific real-world reference, one emotion, a FRESH palette (with exact hex codes), typography (exact Google Font names + weights), and a "never be mistaken for" list — all derived from THIS product, never a preset and never your usual defaults.',
  '',
  'Respond as STRICT JSON only — no markdown fences, no prose outside the JSON object — with exactly this shape:',
  '{"direction":"one sentence naming the invented aesthetic, palette, and fonts","actions":["4-8 ordered, short implementation steps the user will see"],"plan":"the full extended brief the build agent implements: the invented direction; exact palette with hex codes and roles (canvas/surface/text/accent/border); typography (display + body font names, weights, sizes via clamp()); the section list in order with per-section content and the proof object for each; and the motion plan. Be specific and concrete — the agent should need no further design decisions."}',
  'The "plan" string is the build agent\'s north-star; make it detailed enough to implement. The "actions" array is the scannable step list for the user (4-8 items). Keep "direction" to one sentence.',
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
        temperature: 0.9,
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
