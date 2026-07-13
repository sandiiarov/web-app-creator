import { describe, expect, it } from 'vitest'

import { createPlanTool } from './plan.ts'

type PlanResult = {
  actions: string[]
  message: string
  ok: boolean
}

describe('createPlanTool', () => {
  it('responds "implement this now" and echoes the actions for UI display', async () => {
    const plan = createPlanTool()
    const actions = ['Scaffold HTML shell', 'Add design tokens', 'Build hero']
    const res = (await plan.execute?.(
      {
        actions,
        request:
          'Dark-premium SaaS landing page for a developer tool; primary CTA "Start free".',
      },
      undefined as never,
    )) as PlanResult
    expect(res.ok).toBe(true)
    expect(res.message).toBe('implement this now')
    expect(res.actions).toEqual(actions)
  })

  it('carries the plan id and required input shape', () => {
    const plan = createPlanTool()
    expect(plan.id).toBe('plan')
    expect(typeof plan.execute).toBe('function')
    expect(plan.inputSchema).toBeDefined()
  })
})
