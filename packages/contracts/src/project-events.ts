import { z } from 'zod'

import { RunTerminalOutcomeSchema } from './commands.ts'
import {
  ConversationAttachmentSchema,
  ConversationStatsPayloadSchema,
  ProjectTitleSourceSchema,
} from './project-snapshot.ts'

const BaseEnvelope = {
  projectId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  ts: z.string(),
  turnId: z.string().nullable(),
  version: z.literal(2),
}

const RunAcceptedPayloadSchema = z.object({
  attachments: z.array(
    z.object({
      assetPath: z.string().optional(),
      byteLength: z.number().int().nonnegative().optional(),
      kind: z.enum(['element', 'image']),
      mediaType: z.string().optional(),
      name: z.string(),
      selector: z.string().optional(),
      sha256: z.string().optional(),
    }),
  ),
  compactionPercent: z.number().nullable(),
  imageModel: z.string(),
  model: z.string(),
  prompt: z.string(),
  requestDigest: z.string(),
  requestVersion: z.literal(1),
  visionModel: z.string(),
})

const ToolCallPayloadSchema = z
  .object({
    action: z.string().nullable().optional(),
    detail: z.string().nullable().optional(),
    durationMs: z.number().nonnegative().optional(),
    id: z.string(),
    images: z.array(z.object({ alt: z.string(), url: z.string() })).optional(),
    providerId: z.string().optional(),
    result: z.string().nullable().optional(),
    startedAt: z.number().optional(),
    state: z.enum(['done', 'error', 'running', 'start']),
    tool: z.string(),
  })
  .passthrough()

const projectEventSchemas = [
  z.object({
    ...BaseEnvelope,
    payload: RunAcceptedPayloadSchema,
    turnId: z.string().min(1),
    type: z.literal('run_accepted'),
  }),
  z.object({
    ...BaseEnvelope,
    payload: z.object({ delta: z.string(), id: z.string().optional() }),
    turnId: z.string().min(1),
    type: z.literal('text'),
  }),
  z.object({
    ...BaseEnvelope,
    payload: z.object({ delta: z.string(), id: z.string().optional() }),
    turnId: z.string().min(1),
    type: z.literal('thinking'),
  }),
  z.object({
    ...BaseEnvelope,
    payload: ToolCallPayloadSchema,
    turnId: z.string().min(1),
    type: z.literal('tool_call'),
  }),
  z.object({
    ...BaseEnvelope,
    payload: z
      .object({
        durationMs: z.number().nonnegative().optional(),
        error: z.string().optional(),
        id: z.string(),
        observationTokens: z.number().nonnegative().optional(),
        operation: z.enum(['observation', 'reflection']),
        startedAt: z.number().optional(),
        state: z.enum(['done', 'error', 'running']),
        tokensObserved: z.number().nonnegative().optional(),
      })
      .passthrough(),
    turnId: z.string().min(1),
    type: z.literal('memory'),
  }),
  z.object({
    ...BaseEnvelope,
    payload: z.object({
      attempt: z.number().int().positive(),
      delayMs: z.number().nonnegative(),
      issue: z.string(),
      maxAttempts: z.number().int().positive(),
      reason: z.string(),
    }),
    turnId: z.string().min(1),
    type: z.literal('retry'),
  }),
  z.object({
    ...BaseEnvelope,
    payload: ConversationStatsPayloadSchema,
    turnId: z.string().min(1),
    type: z.literal('stats'),
  }),
  z.object({
    ...BaseEnvelope,
    payload: z.object({
      knownUsage: ConversationStatsPayloadSchema.nullable(),
      reason: z.string(),
      turnId: z.string().min(1),
    }),
    turnId: z.string().min(1),
    type: z.literal('run_blocked'),
  }),
  z.object({
    ...BaseEnvelope,
    payload: z.object({
      finishedAt: z.string(),
      outcome: RunTerminalOutcomeSchema,
      reason: z.string().optional(),
      stats: ConversationStatsPayloadSchema.nullable(),
      turnId: z.string().min(1),
    }),
    turnId: z.string().min(1),
    type: z.literal('run_terminal'),
  }),
  z.object({
    ...BaseEnvelope,
    payload: z.object({
      bytes: z.number().int().nonnegative(),
      hash: z.string(),
      html: z.string().optional(),
      previousHash: z.string().optional(),
    }),
    turnId: z.string().min(1),
    type: z.literal('document_changed'),
  }),
  z.object({
    ...BaseEnvelope,
    payload: z.object({ attachments: z.array(ConversationAttachmentSchema) }),
    turnId: z.string().min(1),
    type: z.literal('attachments_update'),
  }),
  z.object({
    ...BaseEnvelope,
    payload: z.object({ id: z.string().min(1) }),
    turnId: z.string().min(1),
    type: z.literal('tool_call_drop'),
  }),
  z.object({
    ...BaseEnvelope,
    payload: z.object({
      brief: z.string().optional(),
      imageModel: z.string().optional(),
      model: z.string().optional(),
      title: z.string().optional(),
      titleSource: ProjectTitleSourceSchema.optional(),
      visionModel: z.string().optional(),
    }),
    turnId: z.null(),
    type: z.literal('project_meta'),
  }),
  z.object({
    ...BaseEnvelope,
    payload: z.object({}),
    type: z.literal('checkpoint'),
  }),
] as const

export const ProjectEventSchema = z
  .discriminatedUnion('type', projectEventSchemas)
  .superRefine((event, context) => {
    if (
      (event.type === 'run_blocked' || event.type === 'run_terminal') &&
      event.payload.turnId !== event.turnId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Payload turnId must match envelope turnId.',
        path: ['payload', 'turnId'],
      })
    }
  })

export const ProtocolErrorSchema = z.object({
  code: z.enum([
    'DOCUMENT_TOO_LARGE',
    'EVENT_TOO_LARGE',
    'INVALID_EVENT',
    'SNAPSHOT_TOO_LARGE',
    'UNSUPPORTED_VERSION',
  ]),
  message: z.string(),
  version: z.literal(2),
})

export type ProjectEvent = z.infer<typeof ProjectEventSchema>
export type ProjectEventType = ProjectEvent['type']
export type ProtocolError = z.infer<typeof ProtocolErrorSchema>
