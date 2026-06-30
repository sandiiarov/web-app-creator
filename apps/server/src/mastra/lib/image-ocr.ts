import { config } from '../../config.ts'

const VISION_MODEL = 'z-ai/glm-5v-turbo'

const DEFAULT_OCR_PROMPT =
  'Extract ALL visible text from every image (OCR). Return the text exactly as it appears, preserving headings, lists, and structure. For each image, also briefly describe brand-relevant visual details: logo marks, product UI, people/scene, color palette, layout, and any notable typography. If an image has no text, say "No text found" for that image and still describe what it shows.'

export interface ImageOcrResult {
  cost?: number
  imagesAnalyzed: number
  ok: boolean
  reason?: string
  text: string
  usage: null | {
    cachedTokens?: number
    completionTokens?: number
    promptTokens?: number
    totalTokens?: number
  }
}

interface OpenRouterChatChoice {
  message?: {
    content?: null | string
    reasoning?: string
    reasoning_details?: Array<{ text?: string }>
  }
}

interface OpenRouterChatResponse {
  choices?: OpenRouterChatChoice[]
  error?: { code?: number; message?: string }
  id?: string
  usage?: {
    completion_tokens?: number
    cost?: number
    prompt_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
    total_tokens?: number
  }
}

interface VisionStats {
  cachedTokens?: number
  completionTokens?: number
  cost?: number
  promptTokens?: number
  totalTokens?: number
}

export async function ocrImages(
  imageUrls: string[],
  prompt: string = DEFAULT_OCR_PROMPT,
): Promise<ImageOcrResult> {
  const urls = normalizeImageUrls(imageUrls)

  if (!urls.length) {
    return {
      imagesAnalyzed: 0,
      ok: true,
      text: '',
      usage: null,
    }
  }

  if (!config.openrouter.apiKey) {
    return {
      imagesAnalyzed: 0,
      ok: false,
      reason:
        'OPENROUTER_API_KEY is not set, so scraped images could not be OCR analyzed.',
      text: '',
      usage: null,
    }
  }

  const loadedImages = await Promise.all(
    urls.map(async (url) => {
      try {
        return { dataUrl: await fetchAsDataUrl(url), url }
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Failed to load image',
          url,
        }
      }
    }),
  )
  const imageRefs = loadedImages.filter(
    (image): image is { dataUrl: string; url: string } => 'dataUrl' in image,
  )
  const failedCount = loadedImages.length - imageRefs.length

  if (!imageRefs.length) {
    return {
      imagesAnalyzed: 0,
      ok: false,
      reason: `No scraped image URLs could be loaded for OCR (${failedCount} failed).`,
      text: '',
      usage: null,
    }
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    body: JSON.stringify({
      max_tokens: 4096,
      messages: [
        {
          content: [
            {
              text: buildPrompt(
                prompt,
                imageRefs.map((image) => image.url),
              ),
              type: 'text',
            },
            ...imageRefs.map((image) => ({
              image_url: { url: image.dataUrl },
              type: 'image_url',
            })),
          ],
          role: 'user',
        },
      ],
      model: VISION_MODEL,
    }),
    headers: {
      Authorization: `Bearer ${config.openrouter.apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return {
      imagesAnalyzed: imageRefs.length,
      ok: false,
      reason: `OpenRouter vision error (${response.status}): ${text.slice(0, 200)}`,
      text: '',
      usage: null,
    }
  }

  const json = (await response.json()) as OpenRouterChatResponse
  if (json.error) {
    return {
      imagesAnalyzed: imageRefs.length,
      ok: false,
      reason: `OpenRouter vision error (${json.error.code ?? 'unknown'}): ${json.error.message ?? 'Unknown error'}`,
      text: '',
      usage: null,
    }
  }

  const message = json.choices?.[0]?.message
  const content = extractMessageText(message)
  const usage = json.usage
  const fallbackStats = await fetchGenerationStats(json.id)

  return {
    cost: typeof usage?.cost === 'number' ? usage.cost : fallbackStats?.cost,
    imagesAnalyzed: imageRefs.length,
    ok: true,
    text: content,
    usage: {
      cachedTokens:
        usage?.prompt_tokens_details?.cached_tokens ?? fallbackStats?.cachedTokens,
      completionTokens: usage?.completion_tokens ?? fallbackStats?.completionTokens,
      promptTokens: usage?.prompt_tokens ?? fallbackStats?.promptTokens,
      totalTokens: usage?.total_tokens ?? fallbackStats?.totalTokens,
    },
  }
}

function buildPrompt(customPrompt: string, urls: string[]): string {
  const imageList = urls.map((url, index) => `${index + 1}. ${url}`).join('\n')
  return `${customPrompt}\n\nAnalyze all ${urls.length} image(s) in order. Label each section exactly as "Image 1", "Image 2", etc. Include the source URL for each image.\n\nSource URLs:\n${imageList}`
}

function detectMediaType(buffer: Buffer): string | undefined {
  if (buffer.length < 4) return undefined
  const hex = buffer.subarray(0, 4).toString('hex')
  if (hex.startsWith('ffd8')) return 'image/jpeg'
  if (hex.startsWith('89504e47')) return 'image/png'
  if (hex.startsWith('47494638')) return 'image/gif'
  if (hex.startsWith('52494646') && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  return undefined
}

function extractMessageText(
  message: OpenRouterChatChoice['message'],
): string {
  if (typeof message?.content === 'string' && message.content.trim()) {
    return message.content
  }
  if (typeof message?.reasoning === 'string' && message.reasoning.trim()) {
    return message.reasoning
  }
  const reasoning = message?.reasoning_details
    ?.map((detail) => detail.text)
    .filter((text): text is string => typeof text === 'string' && !!text.trim())
    .join('\n')
  return reasoning ?? ''
}

/** Fetch an image and return a base64 data URL suitable for OpenRouter. */
async function fetchAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch scraped image (${response.status}): ${url}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  const headerMediaType = response.headers.get('content-type')?.split(';')[0]?.trim()
  const mediaType = headerMediaType?.startsWith('image/')
    ? headerMediaType
    : detectMediaType(buffer)
  if (!mediaType) {
    throw new Error(`Scraped URL is not an image: ${url}`)
  }
  return `data:${mediaType};base64,${buffer.toString('base64')}`
}

async function fetchGenerationStats(
  generationId: string | undefined,
): Promise<undefined | VisionStats> {
  if (!generationId) return undefined
  await new Promise((resolve) => setTimeout(resolve, 500))

  const response = await fetch(
    `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(generationId)}`,
    {
      headers: {
        Authorization: `Bearer ${config.openrouter.apiKey}`,
      },
      method: 'GET',
    },
  )

  if (!response.ok) return undefined
  const json = (await response.json()) as { data?: Record<string, unknown> }
  const data = json.data
  if (!data) return undefined

  const promptTokens = numberFrom(
    data.native_tokens_prompt,
    data.tokens_prompt,
    data.prompt_tokens,
  )
  const completionTokens = numberFrom(
    data.native_tokens_completion,
    data.tokens_completion,
    data.completion_tokens,
  )
  const cachedTokens = numberFrom(
    data.cache_read_input_tokens,
    data.cached_prompt_tokens,
  )
  const totalTokens = numberFrom(data.total_tokens)

  return {
    cachedTokens,
    completionTokens,
    cost: numberFrom(data.total_cost, data.cost),
    promptTokens,
    totalTokens: totalTokens ?? sumDefined(promptTokens, completionTokens),
  }
}

function normalizeImageUrls(imageUrls: string[]): string[] {
  return Array.from(new Set(imageUrls.map((url) => url.trim()).filter(Boolean)))
}

function numberFrom(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function sumDefined(...values: Array<number | undefined>): number | undefined {
  const present = values.filter((value): value is number => typeof value === 'number')
  if (!present.length) return undefined
  return present.reduce((sum, value) => sum + value, 0)
}
