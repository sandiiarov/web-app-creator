import { describe, expect, it } from 'vitest'

import { LANDING_AGENT_INSTRUCTIONS } from './landing-page-agent.ts'

describe('LANDING_AGENT_INSTRUCTIONS', () => {
  it('tells the agent to make minimal changes for fix/refine requests', () => {
    const text = Array.isArray(LANDING_AGENT_INSTRUCTIONS)
      ? LANDING_AGENT_INSTRUCTIONS.join('\n')
      : LANDING_AGENT_INSTRUCTIONS
    // Guards against the over-production failure mode observed in the e2e QA
    // (P2 T3 hit finishReason=length at 19.5k output tokens on a fix turn).
    expect(text).toMatch(/smallest change/i)
    expect(text).toMatch(/do not redesign/i)
  })
})
