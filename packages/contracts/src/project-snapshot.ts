import type {
  ConversationAttachment,
  ConversationMemoryPart,
  ConversationPart,
  ConversationRetryPart,
  ConversationStatsPart,
  ConversationTextPart,
  ConversationThinkingPart,
  ConversationToolCallPart,
  ConversationTurn,
} from '@workspace/conversation'
import { z } from 'zod'

const FiniteNumberSchema = z.number().finite()
const OptionalDurationSchema = FiniteNumberSchema.nonnegative().optional()

export const ConversationAttachmentSchema = z.object({
  analysisText: z.string().optional(),
  html: z.string().optional(),
  id: z.string(),
  kind: z.enum(['element', 'image']).optional(),
  mediaType: z.string().optional(),
  name: z.string(),
  screenshotHeight: FiniteNumberSchema.nonnegative().optional(),
  screenshotWidth: FiniteNumberSchema.nonnegative().optional(),
  selector: z.string().optional(),
  size: FiniteNumberSchema.nonnegative().optional(),
}) satisfies z.ZodType<ConversationAttachment>

export const ConversationMemoryPartSchema = z.object({
  durationMs: OptionalDurationSchema,
  error: z.string().optional(),
  id: z.string(),
  observationTokens: FiniteNumberSchema.nonnegative().optional(),
  operation: z.enum(['observation', 'reflection']),
  startedAt: FiniteNumberSchema.optional(),
  state: z.enum(['done', 'error', 'running']),
  tokensObserved: FiniteNumberSchema.nonnegative().optional(),
  type: z.literal('memory'),
}) satisfies z.ZodType<ConversationMemoryPart>

export const ConversationRetryPartSchema = z.object({
  attempt: FiniteNumberSchema.int().positive(),
  delayMs: FiniteNumberSchema.nonnegative(),
  id: z.string(),
  issue: z.string(),
  maxAttempts: FiniteNumberSchema.int().positive(),
  reason: z.string(),
  startedAt: FiniteNumberSchema,
  type: z.literal('retry'),
}) satisfies z.ZodType<ConversationRetryPart>

export const CostBreakdownSchema = z
  .object({
    image: z
      .object({ cost: FiniteNumberSchema, count: FiniteNumberSchema })
      .passthrough()
      .optional(),
    llm: FiniteNumberSchema,
    scrape: z
      .object({
        calls: FiniteNumberSchema,
        cost: FiniteNumberSchema,
        credits: FiniteNumberSchema,
        firecrawlCost: FiniteNumberSchema.optional(),
        ocrCalls: FiniteNumberSchema.optional(),
        ocrCost: FiniteNumberSchema.optional(),
        ocrImages: FiniteNumberSchema.optional(),
      })
      .passthrough(),
    total: FiniteNumberSchema,
    vision: z
      .object({
        calls: FiniteNumberSchema,
        cost: FiniteNumberSchema,
        images: FiniteNumberSchema,
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export const ConversationStatsPartSchema = z.object({
  cost: FiniteNumberSchema.nonnegative(),
  costBreakdown: CostBreakdownSchema.optional(),
  durationMs: FiniteNumberSchema.nonnegative(),
  finishReason: z.string(),
  model: z.string(),
  type: z.literal('stats'),
  usage: z.record(z.string(), FiniteNumberSchema.optional()),
}) satisfies z.ZodType<ConversationStatsPart>

export const ConversationStatsPayloadSchema = ConversationStatsPartSchema.omit({
  type: true,
})

export const ConversationTextPartSchema = z.object({
  durationMs: OptionalDurationSchema,
  id: z.string(),
  startedAt: FiniteNumberSchema.optional(),
  text: z.string(),
  type: z.literal('text'),
}) satisfies z.ZodType<ConversationTextPart>

export const ConversationThinkingPartSchema = z.object({
  durationMs: OptionalDurationSchema,
  id: z.string(),
  startedAt: FiniteNumberSchema.optional(),
  text: z.string(),
  type: z.literal('thinking'),
}) satisfies z.ZodType<ConversationThinkingPart>

export const ConversationToolCallPartSchema = z.object({
  action: z.string().nullable(),
  detail: z.string().nullable().optional(),
  durationMs: OptionalDurationSchema,
  id: z.string(),
  images: z.array(z.object({ alt: z.string(), url: z.string() })).optional(),
  providerId: z.string().optional(),
  result: z.string().nullable().optional(),
  startedAt: FiniteNumberSchema.optional(),
  state: z.enum(['done', 'error', 'running', 'start']),
  tool: z.string(),
  type: z.literal('tool_call'),
}) satisfies z.ZodType<ConversationToolCallPart>

export const ConversationPartSchema = z.discriminatedUnion('type', [
  ConversationMemoryPartSchema,
  ConversationRetryPartSchema,
  ConversationStatsPartSchema,
  ConversationTextPartSchema,
  ConversationThinkingPartSchema,
  ConversationToolCallPartSchema,
]) satisfies z.ZodType<ConversationPart>

export const ConversationTurnSchema = z.object({
  attachments: z.array(ConversationAttachmentSchema).optional(),
  durationMs: OptionalDurationSchema,
  error: z.string().optional(),
  htmlSwaps: FiniteNumberSchema.int().nonnegative(),
  id: z.string(),
  isStreaming: z.boolean(),
  model: z.string(),
  parts: z.array(ConversationPartSchema),
  prompt: z.string(),
  startedAt: FiniteNumberSchema.optional(),
  stopped: z.boolean().optional(),
}) satisfies z.ZodType<ConversationTurn>

export const ProjectRunStatusSchema = z.enum([
  'error',
  'idle',
  'interrupted',
  'running',
  'stopped',
])

export const ProjectTitleSourceSchema = z.enum(['brief', 'page', 'user'])

export const ProjectMetaSchema = z.object({
  brief: z.string().optional(),
  createdAt: z.string(),
  hasHtml: z.boolean(),
  id: z.string(),
  imageModel: z.string().optional(),
  model: z.string(),
  runBlocked: z.boolean().optional(),
  runStartedAt: z.string().nullable().optional(),
  runTurnId: z.string().nullable().optional(),
  status: ProjectRunStatusSchema.optional(),
  title: z.string(),
  titleSource: ProjectTitleSourceSchema.optional(),
  updatedAt: z.string(),
  visionModel: z.string().optional(),
})

export const ProjectSnapshotSchema = z.object({
  brief: z.string().optional(),
  cursor: z.number().int().nonnegative(),
  documentHash: z.string(),
  html: z.string(),
  models: z.object({ image: z.string(), text: z.string(), vision: z.string() }),
  projectId: z.string(),
  run: z.object({
    blocked: z.boolean(),
    reason: z.string().optional(),
    startedAt: z.string().nullable(),
    status: ProjectRunStatusSchema,
    turnId: z.string().nullable(),
  }),
  title: z.string(),
  titleSource: ProjectTitleSourceSchema.optional(),
  turns: z.array(ConversationTurnSchema),
  version: z.literal(2),
})

export type ProjectMeta = z.infer<typeof ProjectMetaSchema>
export type ProjectRunStatus = z.infer<typeof ProjectRunStatusSchema>
export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>
