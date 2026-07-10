import { describe, expect, it } from 'vitest'

import { LANDING_AGENT_INSTRUCTIONS } from './landing-page-agent.ts'

describe('LANDING_AGENT_INSTRUCTIONS', () => {
  it('tells the agent to make minimal changes for fix/refine requests', () => {
    // Guards against the over-production failure mode observed in e2e QA
    // (a fix turn hit finishReason=length at 19.5k output tokens).
    expect(LANDING_AGENT_INSTRUCTIONS).toMatch(/smallest change/iu)
    expect(LANDING_AGENT_INSTRUCTIONS).toMatch(/do not redesign/iu)
  })

  it('stays minimal (pi-style): tool descriptions are NOT inlined', () => {
    // Tool descriptions reach the model via the `tools` param (function-calling),
    // so they are not duplicated in the base system prompt. The hashline DSL ops
    // live in the `edit` tool description, not here.
    expect(LANDING_AGENT_INSTRUCTIONS).not.toMatch(/SWAP N\.=M/u)
    expect(LANDING_AGENT_INSTRUCTIONS).not.toMatch(/Use `read` to inspect/u)
    expect(LANDING_AGENT_INSTRUCTIONS.length).toBeLessThan(2_500)
  })

  it('does not inline the design skill (discovered via Mastra SkillsProcessor)', () => {
    // The skill's name+description are injected by Mastra's SkillsProcessor and
    // loaded via skill/skill_read (tool descriptions) — not duplicated here.
    expect(LANDING_AGENT_INSTRUCTIONS).not.toMatch(/`design` skill/u)
  })
})
