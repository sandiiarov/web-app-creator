import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

/**
 * Free-form per-run work plan: the agent writes down its approach for the
 * request at the start of the run, in whatever structure fits (steps,
 * phases, notes — always ending with verification). Keeps the build ordered
 * and visible in the UI. Purely organizational — no statuses, no schema for
 * the plan body, no completion gate.
 */

const PLAN_TOOL_DESCRIPTION = `Write down your plan for this request, in whatever structure makes sense to you (steps, phases, sections, notes — your choice). Always end with verification (final screenshot review). Call once at the start; call again only to replace the plan wholesale.`

export function createPlanTool() {
  return createTool({
    description: PLAN_TOOL_DESCRIPTION,
    execute: async ({ plan }) => ({ ok: true as const, summary: plan }),
    id: 'plan',
    inputSchema: z.object({
      action: z
        .string()
        .describe("One short line for the UI, e.g. 'Planning the build'."),
      plan: z.string().describe('Your plan, free form.'),
    }),
    outputSchema: z.object({
      ok: z.literal(true),
      summary: z.string(),
    }),
  })
}
