import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { config } from '../../config.ts'
import {
  type OperationScope,
  runProviderOperation,
} from '../../providers/operation-scope.ts'
import {
  createProviderTransport,
  IMAGE_GENERATION_JSON_MAX_BYTES,
  type ProviderTransport,
} from '../../providers/transport.ts'
import { providerReportedCost } from '../lib/cost.ts'
import type { ImageStore } from '../lib/image-store.ts'

interface OpenRouterImageResponse {
  created?: number
  data?: Array<{ b64_json?: string; media_type?: string }>
  usage?: {
    cost?: number
    estimated_cost?: number
    total_cost?: number
  }
}

/**
 * Build the image-generation tool. `baseUrl` is the server's public origin
 * (e.g. `http://localhost:3001`) so generated images are served back at a
 * short URL the agent embeds directly in `<img src="...">`.
 */
export function createGenerateImageTool(
  baseUrl: string,
  imageStore: ImageStore,
  model: string = config.openrouter.defaultImageModel,
  persistImage?: (imageId: string, extension: string) => null | string,
  execution: {
    operations?: OperationScope
    signal?: AbortSignal
    transport?: ProviderTransport
  } = {},
) {
  return createTool({
    description: `Generate an image from a text prompt using the ${model} image model. Returns a hosted image URL — embed it directly as \`<img src="<url>" alt="...">\`. Use for hero/product imagery, brand visuals, or any raster graphic the landing page needs — do NOT use for icons or decoration. Always pass an action: one short imperative line on what you are generating (shown to the user as the label for this step). Be specific and art-directed in the prompt (subject, lighting, composition, style).`,
    execute: async ({ action: _intent, aspectRatio, prompt }) => {
      if (!config.openrouter.apiKey) {
        return {
          cost: 0,
          imagesGenerated: 0,
          ok: false,
          prompt,
          reason:
            'OPENROUTER_API_KEY is not set. Ask the operator to add it before generating images.',
          url: null,
        }
      }
      return runProviderOperation(
        execution.operations,
        'generate-image',
        async (operation) => {
          const transport = execution.transport ?? createProviderTransport()
          const fetched = await transport.json<OpenRouterImageResponse>({
            init: {
              body: JSON.stringify({
                aspect_ratio: aspectRatio ?? '16:9',
                model,
                prompt,
              }),
              headers: {
                Authorization: `Bearer ${config.openrouter.apiKey}`,
                'Content-Type': 'application/json',
                'X-OpenRouter-Metadata': 'enabled',
              },
              method: 'POST',
            },
            label: 'OpenRouter image generation',
            maxBytes: IMAGE_GENERATION_JSON_MAX_BYTES,
            operation,
            retry: 'paid',
            url: config.openrouter.imageApiUrl,
          })

          if (!fetched.ok) {
            return {
              cost: 0,
              imagesGenerated: 0,
              ok: false,
              prompt,
              reason: fetched.error.message,
              url: null,
            }
          }

          const json = fetched.value
          const providerCost = providerReportedCost(json)
          operation.reportUsage({
            amount: providerCost,
            category: 'image',
            count: json.data?.[0]?.b64_json ? 1 : 0,
            reportId: 'openrouter-response',
            source: 'generation',
            unit: 'usd',
            usage: json.usage,
          })
          const image = json.data?.[0]
          if (!image?.b64_json) {
            return {
              cost: providerCost || undefined,
              imagesGenerated: 0,
              ok: false,
              prompt,
              reason: 'OpenRouter returned no image data.',
              url: null,
            }
          }

          const mediaType = image.media_type ?? 'image/png'
          const dataUrl = `data:${mediaType};base64,${image.b64_json}`
          const { buffer, mediaType: resolvedMediaType } =
            decodeDataUrl(dataUrl)
          const lease = operation.createWriteLease()
          lease.assertWriteAllowed()
          const id = imageStore.saveImage(buffer, resolvedMediaType)
          const extension = imageStore.getImage(id)?.extension ?? 'png'
          let url = `${baseUrl}/images/${id}.${extension}`
          if (persistImage) {
            try {
              lease.assertWriteAllowed()
              const persisted = persistImage(id, `.${extension}`)
              if (!persisted)
                throw new Error('Generated image bytes were unavailable.')
              url = persisted
            } catch (error) {
              return {
                cost: providerCost || undefined,
                imagesGenerated: 0,
                ok: false,
                prompt,
                reason:
                  error instanceof Error
                    ? `Generated image could not be persisted: ${error.message}`
                    : 'Generated image could not be persisted.',
                url: null,
              }
            }
          }
          return {
            cost: providerCost > 0 ? providerCost : undefined,
            imagesGenerated: 1,
            ok: true,
            prompt,
            url,
          }
        },
        { signal: execution.signal },
      )
    },
    id: 'generate_image',
    inputSchema: z.object({
      action: z
        .string()
        .optional()
        .describe(
          'Short reason for generating this image (shown to the user), e.g. "hero product shot for the landing page"',
        ),
      aspectRatio: z
        .enum(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '4:5', '5:4'])
        .optional()
        .describe(
          'Output aspect ratio (default 16:9). Match the slot the image fills.',
        ),
      prompt: z
        .string()
        .min(8)
        .describe(
          'Art-directed text prompt: subject, composition, lighting, style, mood. Be specific.',
        ),
    }),
    outputSchema: z.object({
      cost: z.number().optional(),
      imagesGenerated: z.number(),
      ok: z.boolean(),
      prompt: z.string(),
      reason: z.string().optional(),
      url: z.nullable(z.string()),
    }),
  })
}

function decodeDataUrl(dataUrl: string): { buffer: Buffer; mediaType: string } {
  // data:<mediaType>;base64,<payload>
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/s)
  const payload = match?.[2] ?? ''
  const declaredMediaType = match?.[1]
  const buffer = Buffer.from(payload, 'base64')
  // Providers often omit media_type; detect from magic bytes so the file is
  // served with the correct content-type (Seedream 4.5 returns JPEG).
  const detected = detectMediaType(buffer)
  return {
    buffer,
    mediaType: detected ?? declaredMediaType ?? 'image/png',
  }
}

function detectMediaType(buffer: Buffer): string | undefined {
  if (buffer.length < 4) return undefined
  const hex = buffer.subarray(0, 4).toString('hex')
  if (hex.startsWith('ffd8')) return 'image/jpeg'
  if (hex.startsWith('89504e47')) return 'image/png'
  if (hex.startsWith('47494638')) return 'image/gif'
  if (
    hex.startsWith('52494646') &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return undefined
}
