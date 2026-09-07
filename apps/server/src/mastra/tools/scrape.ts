import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { config } from '../../config.ts'
import {
  type OperationScope,
  runProviderOperation,
} from '../../providers/operation-scope.ts'
import {
  createProviderTransport,
  type ProviderTransport,
} from '../../providers/transport.ts'
import { visionCost } from '../lib/cost.ts'
import { ocrImages } from '../lib/image-ocr.ts'
import type { ProjectRepository } from '../lib/project-store.ts'

/**
 * Vision user prompt for the full-page screenshot Firecrawl returns alongside
 * the scrape. One rendered page image replaces per-image OCR: the layout is
 * visible, so the transcript captures section structure, spacing, color, and
 * typography together with every visible string — the `ui_to_artifact` system
 * prompt already frames the model as a frontend engineer reading a mockup.
 */
const SCREENSHOT_OCR_PROMPT =
  'Analyze this full-page screenshot of a web page. Work section by section from top to bottom (header/nav, hero, features, social proof, pricing, FAQ, footer, etc.). For each section: (1) transcribe ALL visible text exactly — headlines, subheads, body copy, button labels, badges, nav items; (2) describe the layout precisely — column/grid structure, alignment, spacing rhythm, background treatments (solid color, gradient, image), borders/shadows; (3) note imagery and brand details — logo marks, product UI, photos vs illustrations, icon style, people/scenes. Also capture exact hex colors where discernible and typography (font families, weights, relative sizes).'

/**
 * Firecrawl `json` format: structured description of every image on the page,
 * extracted by Firecrawl's LLM over the page content. Complements the
 * screenshot OCR (layout transcript) with per-image details (url, description,
 * dimensions) the agent can cite when reusing or recreating site imagery.
 */
const IMAGE_EXTRACTION_PROMPT = 'Describe each image'

const IMAGE_EXTRACTION_SCHEMA: Record<string, unknown> = {
  properties: {
    images: {
      items: {
        properties: {
          description: { type: 'string' },
          height: { type: 'number' },
          url: { type: 'string' },
          width: { type: 'number' },
        },
        type: 'object',
      },
      type: 'array',
    },
  },
  type: 'object',
}

const ImageDescriptionsSchema = z
  .array(
    z
      .object({
        description: z.string().optional(),
        height: z.number().optional(),
        url: z.string().optional(),
        width: z.number().optional(),
      })
      .catchall(z.unknown()),
  )
  .nullable()

const ImageOcrSchema = z.object({
  cost: z.number().optional(),
  imagesAnalyzed: z.number(),
  ok: z.boolean(),
  reason: z.string().optional(),
  text: z.string(),
  usage: z
    .object({
      cachedTokens: z.number().optional(),
      completionTokens: z.number().optional(),
      promptTokens: z.number().optional(),
      totalTokens: z.number().optional(),
    })
    .nullable(),
})

const BrandingSchema = z
  .object({
    colors: z
      .object({
        accent: z.string().optional(),
        background: z.string().optional(),
        error: z.string().optional(),
        link: z.string().optional(),
        primary: z.string().optional(),
        secondary: z.string().optional(),
        success: z.string().optional(),
        textPrimary: z.string().optional(),
        textSecondary: z.string().optional(),
        warning: z.string().optional(),
      })
      .catchall(z.string().optional())
      .optional(),
    colorScheme: z.enum(['dark', 'light']).optional(),
    fonts: z
      .array(z.object({ family: z.string() }).catchall(z.unknown()))
      .optional(),
    logo: z.nullable(z.string()).optional(),
    typography: z
      .object({
        fontFamilies: z
          .object({
            code: z.string().optional(),
            heading: z.string().optional(),
            primary: z.string().optional(),
          })
          .catchall(z.string().optional())
          .optional(),
        fontStacks: z
          .object({
            body: z.array(z.string()).optional(),
            heading: z.array(z.string()).optional(),
            paragraph: z.array(z.string()).optional(),
            primary: z.array(z.string()).optional(),
          })
          .catchall(z.array(z.string()).optional())
          .optional(),
      })
      .optional(),
  })
  .catchall(z.unknown())

/**
 * Scrape a URL into markdown + links + images + a branding profile (palette,
 * fonts, logo) plus a full-page screenshot. OCRs the rendered screenshot
 * with the configured OpenRouter vision model (layout-aware transcript: section
 * structure, colors, typography, all visible text) and returns it as `imageOcr`;
 * falls back to OCRing every scraped image URL when no screenshot comes back.
 * Use to pull a brand's identity before building or refining a landing page.
 * `action` is surfaced to the UI.
 */
interface CollectImageUrlsOptions {
  baseUrl: string
  brandingLogo: null | string
  markdown: string
  metadata: Record<string, unknown> | undefined
  rawImages: string[]
}

interface FirecrawlDocument {
  branding?: z.infer<typeof BrandingSchema>
  images?: string[]
  json?: unknown
  links?: string[]
  markdown?: string
  metadata?: Record<string, unknown>
  screenshot?: string
}

interface FirecrawlScrapeResponse {
  data?: FirecrawlDocument
  error?: string
  success?: boolean
}

export function createScrapeTool({
  operations,
  projectId,
  repository,
  signal,
  transport = createProviderTransport(),
  turnId,
  visionModel = config.openrouter.defaultVisionModel,
}: {
  operations?: OperationScope
  projectId?: string
  repository: Pick<ProjectRepository, 'appendVisionMessage'>
  signal?: AbortSignal
  transport?: ProviderTransport
  turnId?: string
  visionModel?: string
}) {
  return createTool({
    description:
      'Scrape a URL into markdown + links + images + branding (palette, fonts, logo) plus a full-page screenshot, then OCR that rendered page image with vision and return the layout-aware transcript (sections, colors, typography, all visible text) in `imageOcr`. Handles JavaScript-rendered pages. Use to pull a brand identity and page structure before building or refining a landing page. Always pass an action: one short imperative line on what you are scraping (shown to the user as the label for this step).',
    execute: async ({
      excludeTags,
      includeTags,
      onlyMainContent,
      timeout,
      url,
      waitFor,
    }) => {
      if (!config.firecrawl.apiKey) {
        return {
          branding: null,
          charCount: 0,
          imageCount: 0,
          imageDescriptions: null,
          imageOcr: {
            imagesAnalyzed: 0,
            ok: false,
            reason: 'Scrape did not run, so image OCR did not run.',
            text: '',
            usage: null,
          },
          images: [],
          linkCount: 0,
          links: [],
          markdown: '',
          ok: false,
          reason:
            'FIRECRAWL_API_KEY is not set. Ask the operator to add it before scraping.',
          screenshot: null,
          title: null,
          url,
        }
      }

      return runProviderOperation(
        operations,
        'scrape',
        async (operation) => {
          const response = await transport.json<FirecrawlScrapeResponse>({
            init: {
              body: JSON.stringify({
                excludeTags,
                formats: [
                  { fullPage: true, type: 'screenshot' },
                  'markdown',
                  'links',
                  'images',
                  'branding',
                  {
                    prompt: IMAGE_EXTRACTION_PROMPT,
                    schema: IMAGE_EXTRACTION_SCHEMA,
                    type: 'json',
                  },
                ],
                includeTags,
                maxAge: 172_800_000,
                onlyMainContent: onlyMainContent ?? true,
                parsers: ['pdf'],
                timeout: timeout ?? 30_000,
                url: url.trim(),
                waitFor: waitFor ?? 0,
              }),
              headers: {
                Authorization: `Bearer ${config.firecrawl.apiKey}`,
                'Content-Type': 'application/json',
              },
              method: 'POST',
            },
            label: 'Firecrawl scrape',
            operation,
            retry: 'paid',
            url: `${(config.firecrawl.apiUrl ?? 'https://api.firecrawl.dev').replace(/\/+$/, '')}/v2/scrape`,
          })
          if (!response.ok) {
            return scrapeFailure(url, response.error.message)
          }
          if (response.value.success !== true || !response.value.data) {
            return scrapeFailure(
              url,
              response.value.error ?? 'Firecrawl scrape returned no document.',
            )
          }

          const doc = response.value.data
          const creditsUsed =
            typeof doc.metadata?.creditsUsed === 'number' &&
            Number.isFinite(doc.metadata.creditsUsed)
              ? doc.metadata.creditsUsed
              : undefined
          operation.reportUsage({
            amount: creditsUsed ?? 0,
            category: 'firecrawl',
            count: 1,
            reportId: 'firecrawl-response',
            source: 'scrape',
            unit: 'credits',
          })

          const markdown = doc.markdown ?? ''
          const links = doc.links ?? []
          const branding = doc.branding ?? null
          const images = collectImageUrls({
            baseUrl: url,
            brandingLogo:
              typeof branding?.logo === 'string' ? branding.logo : null,
            markdown,
            metadata: doc.metadata,
            rawImages: doc.images ?? [],
          })
          const screenshot =
            typeof doc.screenshot === 'string' && doc.screenshot
              ? doc.screenshot
              : null
          const imageOcr = screenshot
            ? await ocrImages(
                [screenshot],
                SCREENSHOT_OCR_PROMPT,
                visionModel,
                undefined,
                { operation, source: 'scrape', transport },
              )
            : await ocrImages(images, undefined, visionModel, undefined, {
                operation,
                source: 'scrape',
                transport,
              })
          if (projectId && turnId) {
            void repository.appendVisionMessage(projectId, {
              costUsd: visionCost(imageOcr.usage ?? {}, imageOcr.cost),
              imagesAnalyzed: imageOcr.imagesAnalyzed,
              model: visionModel,
              ok: imageOcr.ok,
              reason: imageOcr.reason,
              source: 'scrape',
              text: imageOcr.text,
              ts: new Date().toISOString(),
              turnId,
              usage: imageOcr.usage ?? undefined,
            })
          }
          const imageDescriptions = extractImageDescriptions(doc.json)
          const title = doc.metadata?.title
          const sourceUrl = doc.metadata?.sourceURL ?? doc.metadata?.url ?? url

          return {
            branding,
            charCount: markdown.length,
            creditsUsed,
            imageCount: images.length,
            imageDescriptions,
            imageOcr,
            images,
            linkCount: links.length,
            links,
            markdown,
            ok: true,
            screenshot,
            title: typeof title === 'string' ? title : null,
            url: typeof sourceUrl === 'string' ? sourceUrl : url,
          }
        },
        { signal },
      )
    },
    id: 'scrape',
    inputSchema: z.object({
      action: z
        .string()
        .optional()
        .describe(
          'Short reason for scraping (shown to the user), e.g. "pull acme.com brand palette + voice before redesigning"',
        ),
      excludeTags: z
        .array(z.string())
        .optional()
        .describe('HTML tags to exclude, e.g. ["nav","footer","aside"]'),
      includeTags: z
        .array(z.string())
        .optional()
        .describe('HTML tags to include, e.g. ["main","article"]'),
      onlyMainContent: z
        .boolean()
        .optional()
        .describe(
          'Strip nav/footer/sidebar for the markdown body (default true). Links/images/branding are always extracted from the whole page.',
        ),
      timeout: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Firecrawl-side scrape timeout in milliseconds (default 30000). Raise for slow JS-heavy pages.',
        ),
      url: z.string().url().describe('Absolute URL to scrape (https://...)'),
      waitFor: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe(
          'Milliseconds to wait for JS rendering before scraping (default 0)',
        ),
    }),
    outputSchema: z.object({
      branding: BrandingSchema.nullable(),
      charCount: z.number(),
      creditsUsed: z.number().optional(),
      imageCount: z.number(),
      imageDescriptions: ImageDescriptionsSchema.optional(),
      imageOcr: ImageOcrSchema,
      images: z.array(z.string()),
      linkCount: z.number(),
      links: z.array(z.string()),
      markdown: z.string(),
      ok: z.boolean(),
      reason: z.string().optional(),
      screenshot: z.string().nullable().optional(),
      title: z.nullable(z.string()),
      url: z.string(),
    }),
  })
}

function collectImageUrls({
  baseUrl,
  brandingLogo,
  markdown,
  metadata,
  rawImages,
}: CollectImageUrlsOptions): string[] {
  return Array.from(
    new Set(
      [
        ...rawImages,
        ...extractMarkdownImageUrls(markdown),
        ...extractMetadataImageUrls(metadata),
        ...(brandingLogo ? [brandingLogo] : []),
      ]
        .map((imageUrl) => normalizeImageUrl(imageUrl, baseUrl))
        .filter((imageUrl): imageUrl is string => !!imageUrl)
        .filter(isLikelyImageUrl),
    ),
  )
}

/** Pull the `{ images: [...] }` array out of Firecrawl's `json` extraction. */
function extractImageDescriptions(
  json: unknown,
): Array<Record<string, unknown>> | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const images = (json as Record<string, unknown>).images
  if (!Array.isArray(images)) return null
  return images.filter(
    (image): image is Record<string, unknown> =>
      !!image && typeof image === 'object' && !Array.isArray(image),
  )
}

function extractMarkdownImageUrls(markdown: string): string[] {
  return [...markdown.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
    .map((match) => match[1])
    .filter((url): url is string => typeof url === 'string' && url.length > 0)
}

function extractMetadataImageUrls(
  metadata: Record<string, unknown> | undefined,
): string[] {
  if (!metadata) return []
  return Object.entries(metadata)
    .filter(([key]) => key.toLowerCase().includes('image'))
    .map(([, value]) => value)
    .filter((value): value is string => typeof value === 'string')
}

/**
 * Keep only fetchable http(s) URLs. Every collector feeding this filter is
 * image-typed by construction (Firecrawl `images` format, markdown `![]()`
 * embeds, metadata `*image*` keys, branding logo), so no file-extension check
 * — CDN image URLs like `lh3.googleusercontent.com/...` carry no extension.
 */
function isLikelyImageUrl(imageUrl: string): boolean {
  try {
    const { protocol } = new URL(imageUrl)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeImageUrl(imageUrl: string, baseUrl: string): null | string {
  const cleaned = imageUrl.trim().replace(/^<|>$/g, '')
  if (!cleaned || cleaned.startsWith('data:')) return null
  try {
    return new URL(cleaned, baseUrl).toString()
  } catch {
    return null
  }
}

function scrapeFailure(url: string, reason: string) {
  return {
    branding: null,
    charCount: 0,
    imageCount: 0,
    imageDescriptions: null,
    imageOcr: {
      imagesAnalyzed: 0,
      ok: false,
      reason: 'Scrape did not complete, so image OCR did not run.',
      text: '',
      usage: null,
    },
    images: [],
    linkCount: 0,
    links: [],
    markdown: '',
    ok: false,
    reason,
    screenshot: null,
    title: null,
    url,
  }
}
