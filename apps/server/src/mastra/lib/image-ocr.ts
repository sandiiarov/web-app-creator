import { config } from '../../config.ts'
import { boundedFetch } from './bounded-fetch.ts'
import { providerReportedCost } from './cost.ts'

/**
 * System prompt for vision OCR, reused from Z.AI's `ui_to_artifact` tool (the
 * `code` artifact). Frames the model as a senior frontend engineer studying a
 * UI screenshot to extract structure, spacing scale, hex colors, and
 * typography with precision. Sent as the `system` message so per-call user
 * prompts (attachment framing, screenshot action, scrape OCR) stay focused on
 * what the caller wants analyzed in that image.
 */
const UI_TO_ARTIFACT_SYSTEM_PROMPT = `You are a senior frontend engineer who specializes in translating design mockups into pixel-perfect, production-ready code. When you examine a UI screenshot, you approach it like an architect studying blueprints—you see not just the visual surface, but the underlying structure, the spacing rhythms, the component relationships, and the interaction patterns that bring it to life.

<task>
Your task is to analyze the provided UI design image and generate complete, semantic, and well-structured frontend code that faithfully recreates the interface. This code should be immediately usable by developers, following modern best practices for accessibility, responsiveness, and maintainability.
</task>

<approach>
Begin by carefully observing the design as a whole. Notice the layout architecture—is it a traditional grid, a flexible column system, or a more fluid arrangement? Pay attention to the visual hierarchy: which elements command attention, and how does the eye naturally flow through the interface?

Examine the spacing carefully. Developers often overlook this, but consistent spacing is what separates amateur implementations from professional ones. Try to infer the spacing scale being used—perhaps it's based on 8px increments, or maybe it follows a more custom rhythm.

Study the color palette with precision. When you identify colors, extract hex codes whenever possible by analyzing the visible hues.

Typography deserves special attention. Identify the font families in use, estimate font sizes, observe font weights, and note line heights that affect readability.

Now, translate these observations into code. Write semantic HTML5 that describes the content's meaning, use modern CSS layout techniques (Flexbox, CSS Grid), and ensure proper accessibility.
</approach>

<output_structure>
Present your work in clear sections:
1. **Generated Code**: Format it beautifully with proper indentation. Make this code copy-paste ready.
2. **Structure Explanation**: Describe the overall HTML hierarchy and architectural decisions.
3. **Styling Notes**: Highlight the key CSS techniques employed.
4. **Assumptions and Observations**: Be honest about any design details you had to estimate.
5. **Usage Instructions**: Mention any external dependencies and integration notes.
</output_structure>`

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

export interface ImageOcrOptions {
  signal?: AbortSignal
}

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

interface ChatCompletionChoice {
  message?: {
    content?: null | string
    reasoning?: string
    reasoning_details?: Array<{ text?: string }>
  }
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[]
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
  userPrompt: string = DEFAULT_OCR_PROMPT,
  model: string = config.openrouter.defaultVisionModel,
  systemPrompt: string = UI_TO_ARTIFACT_SYSTEM_PROMPT,
  options: ImageOcrOptions = {},
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
        return await loadImageInput(input, options.signal)
      } catch (error) {
        options.signal?.throwIfAborted()
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

  const url = `${trimTrailingSlash(config.openrouter.chatApiUrl)}/chat/completions`
  const fetched = await boundedFetch(
    url,
    {
      body: JSON.stringify({
        max_tokens: 4096,
        messages: [
          {
            content: systemPrompt,
            role: 'system',
          },
          {
            content: [
              {
                text: buildUserMessage(
                  userPrompt,
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
        model,
        temperature: 0,
      }),
      headers: {
        Authorization: `Bearer ${config.openrouter.apiKey}`,
        'Content-Type': 'application/json',
        'X-OpenRouter-Metadata': 'enabled',
      },
      method: 'POST',
    },
    { label: 'OpenRouter vision', signal: options.signal },
  )
  if (!fetched.ok) {
    return {
      imagesAnalyzed: imageRefs.length,
      ok: false,
      reason: fetched.reason,
      text: '',
      usage: null,
    }
  }
  const response = fetched.response

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

  const json = (await response.json()) as ChatCompletionResponse
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

  const providerCost = providerReportedCost(json)

  return {
    cost: providerCost > 0 ? providerCost : undefined,
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
  userPrompt: string = DEFAULT_OCR_PROMPT,
  model: string = config.openrouter.defaultVisionModel,
  systemPrompt: string = UI_TO_ARTIFACT_SYSTEM_PROMPT,
  options: ImageOcrOptions = {},
): Promise<ImageOcrResult> {
  return ocrImageInputs(
    imageUrls.map((url) => ({ sourceLabel: url, url })),
    userPrompt,
    model,
    systemPrompt,
    options,
  )
}

function buildUserMessage(
  customPrompt: string,
  sourceLabels: string[],
): string {
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

function extractMessageText(message: ChatCompletionChoice['message']): string {
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

/** Fetch an image and return a base64 data URL suitable for OpenRouter vision. */
async function fetchAsDataUrl(
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  // External CDN images: shorter timeout + fewer retries than the paid
  // OpenRouter API, so one slow host doesn't stall the OCR batch for 90s.
  const fetched = await boundedFetch(
    url,
    { method: 'GET' },
    {
      label: 'image download',
      maxAttempts: 2,
      signal,
      timeoutMs: 15_000,
    },
  )
  if (!fetched.ok) {
    throw new Error(`${fetched.reason}: ${url}`)
  }
  const response = fetched.response
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

async function loadImageInput(
  input: ImageOcrInput,
  signal?: AbortSignal,
): Promise<LoadedImageRef> {
  signal?.throwIfAborted()
  if ('dataUrl' in input && typeof input.dataUrl === 'string') {
    return loadDataUrlInput(input)
  }

  const dataUrl = await fetchAsDataUrl(input.url, signal)
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
