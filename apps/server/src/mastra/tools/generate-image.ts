import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { config } from '../../config.ts'
import { boundedFetch } from '../lib/bounded-fetch.ts'
import { providerReportedCost } from '../lib/cost.ts'
import { getImage, saveImage } from '../lib/image-store.ts'

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
  model: string = config.openrouter.defaultImageModel,
) {
  return createTool({
    description:
      'Generate an image from a text prompt using the Seedream 4.5 model. Returns a hosted URL (e.g. http://localhost:3001/images/img-1.jpg) — embed it directly as `<img src="<url>" alt="...">`. Use for hero/product imagery, brand visuals, or any raster graphic the landing page needs — do NOT use for icons or decoration. Always pass an action: one short imperative line on what you are generating (shown to the user as the label for this step). Be specific and art-directed in the prompt (subject, lighting, composition, style).',
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

      const fetched = await boundedFetch(
        config.openrouter.imageApiUrl,
        {
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
        { label: 'OpenRouter image generation' },
      )

      if (!fetched.ok) {
        return {
          cost: 0,
          imagesGenerated: 0,
          ok: false,
          prompt,
          reason: fetched.reason,
          url: null,
        }
      }

      const response = fetched.response
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        return {
          cost: 0,
          imagesGenerated: 0,
          ok: false,
          prompt,
          reason: `OpenRouter image API error (${response.status}): ${text.slice(0, 200)}`,
          url: null,
        }
      }

      const json = (await response.json()) as OpenRouterImageResponse
      const image = json.data?.[0]
      if (!image?.b64_json) {
        return {
          cost: 0,
          imagesGenerated: 0,
          ok: false,
          prompt,
          reason: 'OpenRouter returned no image data.',
          url: null,
        }
      }

      const mediaType = image.media_type ?? 'image/png'
      const dataUrl = `data:${mediaType};base64,${image.b64_json}`
      const { buffer, mediaType: resolvedMediaType } = decodeDataUrl(dataUrl)
      const id = saveImage(buffer, resolvedMediaType)
      const extension = getImage(id)?.extension ?? 'png'
      const url = `${baseUrl}/images/${id}.${extension}`

      const providerCost = providerReportedCost(json)
      return {
        cost: providerCost > 0 ? providerCost : undefined,
        imagesGenerated: 1,
        ok: true,
        prompt,
        url,
      }
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
