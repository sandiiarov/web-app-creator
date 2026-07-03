import { config } from '../../config.ts'

export const BASETEN_VISION_MODEL = 'moonshotai/Kimi-K2.7-Code'

const DEFAULT_OCR_PROMPT =
  'Extract ALL visible text from every image (OCR). Return the text exactly as it appears, preserving headings, lists, and structure. For each image, also briefly describe brand-relevant visual details: logo marks, product UI, people/scene, color palette, layout, and any notable typography. If an image has no text, say "No text found" for that image and still describe what it shows.'

const SUPPORTED_IMAGE_MEDIA_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

export interface ImageOcrDataUrlInput {
  dataUrl: string
  sourceLabel?: string
  url?: never
}

export type ImageOcrInput = ImageOcrDataUrlInput | ImageOcrUrlInput

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

export interface ImageOcrUrlInput {
  dataUrl?: never
  sourceLabel?: string
  url: string
}

interface BasetenChatChoice {
  message?: {
    content?: null | string
    reasoning?: string
    reasoning_details?: Array<{ text?: string }>
  }
}

interface BasetenChatResponse {
  choices?: BasetenChatChoice[]
  error?: { code?: number | string; message?: string }
  usage?: {
    completion_tokens?: number
    cost?: number
    estimated_cost?: number
    prompt_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
    total_cost?: number
    total_tokens?: number
  }
}

interface FailedImageRef {
  error: string
  sourceLabel: string
}

interface LoadedImageRef {
  dataUrl: string
  sourceLabel: string
}

export async function ocrImageInputs(
  inputs: ImageOcrInput[],
  prompt: string = DEFAULT_OCR_PROMPT,
): Promise<ImageOcrResult> {
  const imageInputs = normalizeImageInputs(inputs)

  if (!imageInputs.length) {
    return {
      imagesAnalyzed: 0,
      ok: true,
      text: '',
      usage: null,
    }
  }

  const loadedImages = await Promise.all(
    imageInputs.map(async (input) => {
      try {
        return await loadImageInput(input)
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : 'Failed to load image',
          sourceLabel: sourceLabelForInput(input),
        }
      }
    }),
  )
  const imageRefs = loadedImages.filter(
    (image): image is LoadedImageRef => 'dataUrl' in image,
  )
  const failedCount = loadedImages.length - imageRefs.length

  if (!imageRefs.length) {
    const failureDetail = summarizeFailedImages(loadedImages)
    return {
      imagesAnalyzed: 0,
      ok: false,
      reason: `No image inputs could be loaded for OCR (${failedCount} failed${failureDetail ? `: ${failureDetail}` : ''}).`,
      text: '',
      usage: null,
    }
  }

  const response = await fetch(
    `${trimTrailingSlash(config.baseten.url)}/chat/completions`,
    {
      body: JSON.stringify({
        max_tokens: 4096,
        messages: [
          {
            content: [
              {
                text: buildPrompt(
                  prompt,
                  imageRefs.map((image) => image.sourceLabel),
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
        model: BASETEN_VISION_MODEL,
        temperature: 0,
      }),
      headers: {
        Authorization: `Bearer ${config.baseten.apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  )

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return {
      imagesAnalyzed: imageRefs.length,
      ok: false,
      reason: `Baseten vision error (${response.status}): ${text.slice(0, 200)}`,
      text: '',
      usage: null,
    }
  }

  const json = (await response.json()) as BasetenChatResponse
  if (json.error) {
    return {
      imagesAnalyzed: imageRefs.length,
      ok: false,
      reason: `Baseten vision error (${json.error.code ?? 'unknown'}): ${json.error.message ?? 'Unknown error'}`,
      text: '',
      usage: null,
    }
  }

  const message = json.choices?.[0]?.message
  const content = extractMessageText(message)
  const usage = json.usage

  return {
    cost: extractResponseCost(usage),
    imagesAnalyzed: imageRefs.length,
    ok: true,
    text: content,
    usage: {
      cachedTokens: usage?.prompt_tokens_details?.cached_tokens,
      completionTokens: usage?.completion_tokens,
      promptTokens: usage?.prompt_tokens,
      totalTokens: usage?.total_tokens,
    },
  }
}

export async function ocrImages(
  imageUrls: string[],
  prompt: string = DEFAULT_OCR_PROMPT,
): Promise<ImageOcrResult> {
  return ocrImageInputs(
    imageUrls.map((url) => ({ sourceLabel: url, url })),
    prompt,
  )
}

function buildPrompt(customPrompt: string, sourceLabels: string[]): string {
  const sourceList = sourceLabels
    .map((sourceLabel, index) => `${index + 1}. ${sourceLabel}`)
    .join('\n')
  return `${customPrompt}\n\nAnalyze all ${sourceLabels.length} image(s) in order. Label each section exactly as "Image 1", "Image 2", etc. Include the source label for each image.\n\nSource labels:\n${sourceList}`
}

function dataUrlFromBuffer(buffer: Buffer, mediaType: string): string {
  return `data:${mediaType};base64,${buffer.toString('base64')}`
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

function extractMessageText(message: BasetenChatChoice['message']): string {
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

function extractResponseCost(
  usage: BasetenChatResponse['usage'],
): number | undefined {
  return numberFrom(usage?.cost, usage?.total_cost, usage?.estimated_cost)
}

/** Fetch an image and return a base64 data URL suitable for Baseten vision. */
async function fetchAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status}): ${url}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  const headerMediaType = response.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim()
  const mediaType = headerMediaType?.startsWith('image/')
    ? headerMediaType
    : detectMediaType(buffer)
  if (!mediaType || !isSupportedImageMediaType(mediaType)) {
    throw new Error(`URL is not a supported image: ${url}`)
  }
  return dataUrlFromBuffer(buffer, mediaType)
}

function isSupportedImageMediaType(mediaType: string): boolean {
  return SUPPORTED_IMAGE_MEDIA_TYPES.has(mediaType.toLowerCase())
}

function keyForInput(input: ImageOcrInput): string | undefined {
  if ('dataUrl' in input && typeof input.dataUrl === 'string') {
    const dataUrl = input.dataUrl.trim()
    return dataUrl ? `data:${dataUrl}` : undefined
  }
  const url = input.url.trim()
  return url ? `url:${url}` : undefined
}

function loadDataUrlInput(input: ImageOcrDataUrlInput): LoadedImageRef {
  const dataUrl = input.dataUrl.trim()
  const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/)
  const mediaType = match?.[1]?.toLowerCase()
  const payload = match?.[2]?.replace(/\s+/g, '')

  if (!mediaType || !payload) {
    throw new Error('Image data URL must be base64 encoded.')
  }
  if (!isSupportedImageMediaType(mediaType)) {
    throw new Error(`Unsupported image media type: ${mediaType}`)
  }

  return {
    dataUrl: `data:${mediaType};base64,${payload}`,
    sourceLabel: input.sourceLabel?.trim() || 'Uploaded image',
  }
}

async function loadImageInput(input: ImageOcrInput): Promise<LoadedImageRef> {
  if ('dataUrl' in input && typeof input.dataUrl === 'string') {
    return loadDataUrlInput(input)
  }

  const dataUrl = await fetchAsDataUrl(input.url)
  return {
    dataUrl,
    sourceLabel: input.sourceLabel?.trim() || input.url,
  }
}

function normalizeImageInputs(inputs: ImageOcrInput[]): ImageOcrInput[] {
  const seen = new Set<string>()
  const normalized: ImageOcrInput[] = []

  for (const input of inputs) {
    const key = keyForInput(input)
    if (!key || seen.has(key)) continue
    seen.add(key)
    normalized.push(input)
  }

  return normalized
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

function sourceLabelForInput(input: ImageOcrInput): string {
  if (input.sourceLabel?.trim()) return input.sourceLabel.trim()
  if ('url' in input && typeof input.url === 'string') return input.url
  return 'Uploaded image'
}

function summarizeFailedImages(
  loadedImages: Array<FailedImageRef | LoadedImageRef>,
): string {
  return loadedImages
    .filter((image): image is FailedImageRef => 'error' in image)
    .slice(0, 3)
    .map((image) => `${image.sourceLabel}: ${image.error}`)
    .join('; ')
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}
