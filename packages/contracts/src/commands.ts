import { z } from 'zod'

const NonEmptyStringSchema = z.string().trim().min(1)
const ModelIdSchema = NonEmptyStringSchema

export const ElementAttachmentCommandSchema = z.object({
  kind: z.literal('element'),
  selector: NonEmptyStringSchema,
})

export const ImageAttachmentCommandSchema = z.object({
  dataUrl: NonEmptyStringSchema,
  id: NonEmptyStringSchema,
  kind: z.literal('image').optional(),
  mediaType: z.enum(['image/gif', 'image/jpeg', 'image/png', 'image/webp']),
  name: NonEmptyStringSchema,
  size: z.number().int().positive(),
})

export const RunAttachmentCommandSchema = z.union([
  ElementAttachmentCommandSchema,
  ImageAttachmentCommandSchema,
])

export const StartRunCommandSchema = z.object({
  attachments: z.array(RunAttachmentCommandSchema).max(4).optional(),
  compactionPercent: z.number().min(1).max(100).optional(),
  imageModel: ModelIdSchema.optional(),
  projectId: NonEmptyStringSchema,
  prompt: NonEmptyStringSchema,
  textModel: ModelIdSchema.optional(),
  turnId: NonEmptyStringSchema.max(128).optional(),
  visionModel: ModelIdSchema.optional(),
})

export const RunTerminalOutcomeSchema = z.enum([
  'completed',
  'error',
  'interrupted',
  'stopped',
])

export const StartRunResultSchema = z.discriminatedUnion('ok', [
  z.object({
    existing: z.literal(true).optional(),
    ok: z.literal(true),
    outcome: RunTerminalOutcomeSchema.optional(),
    status: z.literal('running'),
    turnId: NonEmptyStringSchema,
  }),
  z.object({
    error: z.string().optional(),
    ok: z.literal(false),
    reason: z.enum([
      'conflict',
      'deleted',
      'forbidden',
      'not_found',
      'overlap',
      'storage',
      'validation',
    ]),
  }),
])

export type RunAttachmentCommand = z.infer<typeof RunAttachmentCommandSchema>
export type StartRunCommand = z.infer<typeof StartRunCommandSchema>
export type StartRunResult = z.infer<typeof StartRunResultSchema>
