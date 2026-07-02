import { createTool } from '@mastra/core/tools'
import { Firecrawl } from 'firecrawl'
import { z } from 'zod'

import { config } from '../../config.ts'
import { ocrImages } from '../lib/image-ocr.ts'

/**
 * Lazily-built Firecrawl client (shared across calls). Reads
 * `FIRECRAWL_API_KEY` from config; the tool returns a clear error if unset.
 */
let client: Firecrawl | null = null
function getClient(): Firecrawl | null {
  if (!config.firecrawl.apiKey) return null
  if (!client) client = new Firecrawl({ apiKey: config.firecrawl.apiKey })
  return client
}

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
 * fonts, logo). Also OCRs every scraped image URL with GLM-5V-Turbo and returns
 * the transcript as `imageOcr`. Use to pull a brand's identity before building
 * or refining a landing page. `intent` is surfaced to the UI.
 */
interface CollectImageUrlsOptions {
  baseUrl: string
  brandingLogo: null | string
  markdown: string
  metadata: Record<string, unknown> | undefined
  rawImages: string[]
}

export function createScrapeTool() {
  return createTool({
    description:
      'Scrape a URL into markdown + links + images + branding (palette, fonts, logo), then OCR all scraped image URLs and return the OCR/visual transcript in `imageOcr`. Handles JavaScript-rendered pages. Use to pull a brand identity before building or refining a landing page. Always pass an intent describing what you are scraping and why.',
    execute: async ({
      excludeTags,
      includeTags,
      onlyMainContent,
      url,
      waitFor,
    }) => {
      const fc = getClient()
      if (!fc) {
        return {
          branding: null,
          charCount: 0,
          imageCount: 0,
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
          title: null,
          url,
        }
      }

      const doc = await fc.scrape(url, {
        excludeTags,
        formats: ['markdown', 'links', 'images', 'branding'],
        includeTags,
        onlyMainContent: onlyMainContent ?? true,
        waitFor: waitFor ?? 0,
      })

      const markdown = doc.markdown ?? ''
      const links = doc.links ?? []
      const branding = doc.branding ?? null
      const images = collectImageUrls({
        baseUrl: url,
        brandingLogo: typeof branding?.logo === 'string' ? branding.logo : null,
        markdown,
        metadata: doc.metadata,
        rawImages: doc.images ?? [],
      })
      const imageOcr = await ocrImages(images)
      const title = doc.metadata?.title
      const sourceUrl = doc.metadata?.sourceURL ?? doc.metadata?.url ?? url
      const creditsUsed =
        typeof doc.metadata?.creditsUsed === 'number'
          ? doc.metadata.creditsUsed
          : undefined

      return {
        branding,
        charCount: markdown.length,
        creditsUsed,
        imageCount: images.length,
        imageOcr,
        images,
        linkCount: links.length,
        links,
        markdown,
        ok: true,
        title: typeof title === 'string' ? title : null,
        url: sourceUrl,
      }
    },
    id: 'scrape',
    inputSchema: z.object({
      excludeTags: z
        .array(z.string())
        .optional()
        .describe('HTML tags to exclude, e.g. ["nav","footer","aside"]'),
      includeTags: z
        .array(z.string())
        .optional()
        .describe('HTML tags to include, e.g. ["main","article"]'),
      intent: z
        .string()
        .describe(
          'Short reason for scraping (shown to the user), e.g. "pull acme.com brand palette + voice before redesigning"',
        ),
      onlyMainContent: z
        .boolean()
        .optional()
        .describe(
          'Strip nav/footer/sidebar for the markdown body (default true). Links/images/branding are always extracted from the whole page.',
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
      imageOcr: ImageOcrSchema,
      images: z.array(z.string()),
      linkCount: z.number(),
      links: z.array(z.string()),
      markdown: z.string(),
      ok: z.boolean(),
      reason: z.string().optional(),
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

function isLikelyImageUrl(imageUrl: string): boolean {
  try {
    const { pathname, protocol } = new URL(imageUrl)
    if (protocol !== 'http:' && protocol !== 'https:') return false
    return /\.(avif|gif|jpe?g|png|webp)$/i.test(pathname)
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
