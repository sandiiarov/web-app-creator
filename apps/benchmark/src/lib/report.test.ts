import { describe, expect, it } from 'vitest'

import { buildBenchmarkReport, createReportHandoffPrompt } from './report'
import type { BenchmarkUserFeedback, RunResult } from './types'

const FEEDBACK: BenchmarkUserFeedback = {
  notes: 'Hero is generic and the edit loop was expensive.',
  problemAreas: ['tool_behavior', 'cost'],
  rating: 'needs-work',
  requestedAdjustment: 'Improve edit targeting and reduce retries.',
}

const RUN: RunResult = {
  editCount: 2,
  finishedAt: 1_700_000_003_000,
  html: '<main><h1>Orbit Notes</h1></main>',
  id: 'run-1',
  mistakes: [
    {
      at: 1_700_000_002_000,
      kind: 'tool_error',
      message: 'Edit anchor not found',
      tool: 'edit',
    },
  ],
  modelId: 'z-ai/glm-5.2',
  modelLabel: 'GLM 5.2',
  previewDiagnostics: [],
  projectId: 'project-1',
  promptId: 'prompt-1',
  promptText: 'Build a landing page for Orbit Notes.',
  retryCount: 1,
  screenshotCaptures: [],
  startedAt: 1_700_000_000_000,
  stats: {
    cost: 0.0123,
    durationMs: 3000,
    finishReason: 'stop',
    model: 'z-ai/glm-5.2',
    usage: { totalTokens: 1234 },
  },
  status: 'done',
  text: 'Done',
  toolCalls: [
    {
      id: 'tool-1',
      intent: 'Read current page',
      result: 'Loaded HTML',
      state: 'done',
      tool: 'read',
    },
  ],
}

describe('benchmark report', () => {
  it('builds a coding-agent-readable report from run results', () => {
    const report = buildBenchmarkReport({
      concurrency: 1,
      models: [{ id: 'z-ai/glm-5.2', label: 'GLM 5.2' }],
      prompts: [{ id: 'prompt-1', text: RUN.promptText }],
      results: [RUN],
      userFeedback: FEEDBACK,
    })

    expect(report).toMatchObject({
      app: 'benchmark',
      reportVersion: '1',
      runConfig: {
        concurrency: 1,
        screenshotCapture: 'client-preview-capture',
      },
      summary: {
        completedRuns: 1,
        doneRuns: 1,
        totalCost: 0.0123,
        totalMistakes: 1,
        totalRetries: 1,
        totalToolCalls: 1,
      },
      userFeedback: FEEDBACK,
    })
    expect(report.aggregates).toEqual([
      expect.objectContaining({
        averageCost: 0.0123,
        modelId: 'z-ai/glm-5.2',
        totalEdits: 2,
      }),
    ])
    expect(report.runs[0]).toMatchObject({
      durationMs: 3000,
      htmlBytes: expect.any(Number),
      toolCalls: RUN.toolCalls,
    })
  })

  it('creates a handoff prompt that points the next agent at the saved file', () => {
    const report = buildBenchmarkReport({
      concurrency: 1,
      models: [{ id: 'z-ai/glm-5.2', label: 'GLM 5.2' }],
      prompts: [{ id: 'prompt-1', text: RUN.promptText }],
      results: [RUN],
      userFeedback: FEEDBACK,
    })

    const prompt = createReportHandoffPrompt(
      '/Users/alex/project/apps/server/.data/benchmark-reports/report.json',
      report,
    )

    expect(prompt).toContain(
      '/Users/alex/project/apps/server/.data/benchmark-reports/report.json',
    )
    expect(prompt).toContain('Read that file first')
    expect(prompt).toContain('tool calls')
    expect(prompt).toContain('user notes')
  })
})
