import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { config } from '../../config.ts'
import type { BrowserScreenshotResult } from '../lib/browser-screenshot.ts'
import { ocrImageInputs } from '../lib/image-ocr.ts'

const SCREENSHOT_TIMEOUT_MS = 25_000
const SCREENSHOT_VIEWPORT_SIZE_VALUES = ['mobile', 'tablet', 'desktop'] as const

export interface BrowserScreenshotRequestInput {
  selector: string
  timeoutMs: number
  viewportSize: ScreenshotViewportSize
}

export type RequestBrowserScreenshot = (
  input: BrowserScreenshotRequestInput,
) => Promise<BrowserScreenshotResult>

export type ScreenshotViewportSize =
  (typeof SCREENSHOT_VIEWPORT_SIZE_VALUES)[number]

/**
 * Recover screenshot args from malformed tool-call input. GLM-5.2 sometimes
 * streams selector/viewportSize wrapped in arg_key/arg_value tags that
 * collapse the JSON into one mangled key (the model meant a clean
 * selector/viewportSize/action object), and occasionally passes the whole
 * object as a JSON string. Regex-extract the intended values so a usable
 * screenshot call lands instead of a validation error plus retry.
 */
export function recoverScreenshotArgs(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return recoverScreenshotArgs(JSON.parse(value))
    } catch {
      /* fall through to regex extraction below */
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>
    if (
      typeof candidate.selector === 'string' &&
      typeof candidate.viewportSize === 'string'
    ) {
      return value
    }
  }
  const text =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object'
        ? Object.entries(value as Record<string, unknown>)
            .map(
              ([key, val]) =>
                `${key}=${typeof val === 'string' ? val : JSON.stringify(val)}`,
            )
            .join(' ')
        : String(value ?? '')
  const recovered: Record<string, unknown> = {}
  const viewport = /\b(mobile|tablet|desktop)\b/i.exec(text)
  if (viewport) recovered.viewportSize = viewport[1]!.toLowerCase()
  const selectorQuoted = /selector.*?=['"]([^'"]+)['"]/.exec(text)
  const selectorTagged = /selector<\/arg_key>[^<]*<arg_value>([^<]+)/.exec(text)
  const selector = selectorQuoted?.[1] ?? selectorTagged?.[1]
  if (selector) recovered.selector = selector
  const action = /action.*?=['"]([^'"]+)['"]/.exec(text)
  if (action) recovered.action = action[1]
  return recovered
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

export function createScreenshotTool(
  requestScreenshot?: RequestBrowserScreenshot,
  visionModel: string = config.openrouter.defaultVisionModel,
) {
  return createTool({
    description:
      'Request a browser-rendered screenshot of one element in the current project HTML document, then OCR/analyze it with vision. Accepts three arguments: a CSS element selector, viewportSize (mobile, tablet, or desktop), and an action describing what to inspect. The action becomes the vision prompt alongside the Z.AI ui_to_artifact system prompt, so state precisely what feedback you need (e.g. "check hero spacing and CTA contrast", "verify mobile nav wraps without clipping"). Use after substantial edits or when you need visual feedback about layout, text, spacing, contrast, clipping, or responsive issues. The image is annotated with numbered red badges on each interactive element, and the result includes an elementMap listing every badge (index → role / accessible name / bounding box / state), so reference elements by index (e.g. "the CTA at badge 0"). Returns a padded element screenshot OCR/visual transcript plus the elementMap; it does not create files.',
    execute: async (rawInput) => {
      const { action, selector, viewportSize } = recoverScreenshotArgs(
        rawInput,
      ) as {
        action?: string
        selector?: string
        viewportSize?: ScreenshotViewportSize
      }
      if (!selector || !viewportSize) {
        return {
          elementMap: '',
          height: null,
          imageOcr: {
            imagesAnalyzed: 0,
            ok: false,
            reason:
              'screenshot requires a selector and a viewportSize (mobile, tablet, or desktop).',
            text: '',
            usage: null,
          },
          imageUrl: null,
          mediaType: null,
          ok: false,
          reason:
            'screenshot requires a selector and a viewportSize (mobile, tablet, or desktop).',
          selector: selector ?? '',
          text: '',
          viewportSize: viewportSize ?? 'desktop',
          width: null,
        }
      }
      if (!requestScreenshot) {
        return {
          elementMap: '',
          height: null,
          imageOcr: {
            imagesAnalyzed: 0,
            ok: false,
            reason:
              'Browser screenshot capture is unavailable in this runtime.',
            text: '',
            usage: null,
          },
          imageUrl: null,
          mediaType: null,
          ok: false,
          reason: 'Browser screenshot capture is unavailable in this runtime.',
          selector,
          text: '',
          viewportSize,
          width: null,
        }
      }

      let screenshot: BrowserScreenshotResult
      try {
        screenshot = await requestScreenshot({
          selector,
          timeoutMs: SCREENSHOT_TIMEOUT_MS,
          viewportSize,
        })
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : 'Screenshot capture failed.'
        return {
          elementMap: '',
          height: null,
          imageOcr: {
            imagesAnalyzed: 0,
            ok: false,
            reason,
            text: '',
            usage: null,
          },
          imageUrl: null,
          mediaType: null,
          ok: false,
          reason,
          selector,
          text: '',
          viewportSize,
          width: null,
        }
      }

      const imageOcr = await ocrImageInputs(
        [
          {
            dataUrl: screenshot.dataUrl,
            sourceLabel: `browser screenshot ${screenshot.width}×${screenshot.height} of ${selector} at ${viewportSize} viewport`,
          },
        ],
        `${action ?? 'Inspect this element for layout, spacing, contrast, and responsive issues.'}\nTarget selector: ${selector}\nViewport size: ${viewportSize}`,
        visionModel,
      )

      return {
        elementMap: screenshot.elementMap ?? '',
        height: screenshot.height,
        imageOcr,
        imageUrl: screenshot.imageUrl ?? null,
        mediaType: screenshot.mediaType,
        ok: imageOcr.ok,
        reason: imageOcr.reason,
        selector,
        text: imageOcr.text,
        viewportSize,
        width: screenshot.width,
      }
    },
    id: 'screenshot',
    inputSchema: z
      .object({
        action: z
          .string()
          .optional()
          .describe(
            'What to inspect in this screenshot; becomes the vision prompt alongside the ui_to_artifact system prompt, e.g. "check hero spacing and CTA contrast" or "verify mobile nav wraps without clipping".',
          ),
        selector: z
          .string()
          .min(1)
          .max(300)
          .optional()
          .describe(
            'CSS selector for the element to capture, e.g. "body", "main", "#hero", ".pricing-card", or "button[type=submit]".',
          ),
        viewportSize: z
          .enum(SCREENSHOT_VIEWPORT_SIZE_VALUES)
          .optional()
          .describe(
            'Responsive viewport size to render before capture: mobile, tablet, or desktop.',
          ),
      })
      .passthrough(),
    outputSchema: z.object({
      elementMap: z.string(),
      height: z.number().nullable(),
      imageOcr: ImageOcrSchema,
      imageUrl: z.string().nullable(),
      mediaType: z.nullable(z.enum(['image/jpeg', 'image/png', 'image/webp'])),
      ok: z.boolean(),
      reason: z.string().optional(),
      selector: z.string(),
      text: z.string(),
      viewportSize: z.enum(SCREENSHOT_VIEWPORT_SIZE_VALUES),
      width: z.number().nullable(),
    }),
    strict: true,
  })
}
