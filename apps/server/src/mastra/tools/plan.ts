import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

/**
 * Pure-reasoning tool that forces a visible planning step before any page
 * creation or redesign. It does no external work and makes no provider call —
 * the landing-page design guidance is attached to the first user message (paid
 * once per session), so this tool only structures the model's plan into a UI
 * artifact.
 *
 * The agent MUST call `plan` first for new/redesign/substantial work (enforced
 * in `LANDING_AGENT_INSTRUCTIONS`). `actions` is the ordered step list shown to
 * the user; `request` is the expanded brief the agent then implements via
 * `edit`/`generate_image`. The result echoes `actions` (for the UI `PlanBlock`)
 * alongside a terse `message` that drives the agent onward.
 */
export function createPlanTool() {
  return createTool({
    description:
      'Plan a landing-page creation or redesign BEFORE editing. Call this FIRST for any new page, redesign, or substantial change. Provide `actions` — the ordered, short implementation steps the user sees — and `request` — the expanded brief (audience, goal, primary CTA, inspiration/reference, chosen design preset, section list, motion plan). After `plan` returns, implement it with `edit` and `generate_image`. Do NOT call `edit` until `plan` has returned. A focused single-line fix or tweak may skip `plan`.',
    execute: async ({ actions }) => ({
      actions,
      message: 'implement this now',
      ok: true,
    }),
    id: 'plan',
    inputSchema: z.object({
      actions: z
        .array(z.string().min(1))
        .min(1)
        .describe(
          'Ordered, short implementation steps shown to the user, e.g. ["Scaffold HTML shell","Add design tokens","Build hero","Add feature sections","Add motion + verify responsive"]. One step per intended edit batch.',
        ),
      request: z
        .string()
        .min(16)
        .describe(
          'The expanded brief you will implement: audience, goal, primary CTA, inspiration/reference, chosen design preset (A Dark Premium / B Light & Warm / C Bold & Minimal), section list, and motion plan. This is the north-star prompt for your edits.',
        ),
    }),
    outputSchema: z.object({
      actions: z.array(z.string()),
      message: z.string(),
      ok: z.boolean(),
    }),
  })
}
