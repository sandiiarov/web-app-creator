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
      'Request a browser-rendered screenshot of one element in the current project HTML document, then OCR/analyze it with vision. Accepts three arguments: a CSS element selector, viewportSize (mobile, tablet, or desktop), and an intent describing what to inspect. The intent becomes the vision prompt alongside the Z.AI ui_to_artifact system prompt, so state precisely what feedback you need (e.g. "check hero spacing and CTA contrast", "verify mobile nav wraps without clipping"). Use after substantial edits or when you need visual feedback about layout, text, spacing, contrast, clipping, or responsive issues. Returns a padded element screenshot OCR/visual transcript; it does not create files.',
    execute: async ({ intent, selector, viewportSize }) => {
      if (!requestScreenshot) {
        return {
          height: null,
          imageOcr: {
            imagesAnalyzed: 0,
            ok: false,
            reason:
              'Browser screenshot capture is unavailable in this runtime.',
            text: '',
            usage: null,
          },
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
          height: null,
          imageOcr: {
            imagesAnalyzed: 0,
            ok: false,
            reason,
            text: '',
            usage: null,
          },
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
        `${intent}\nTarget selector: ${selector}\nViewport size: ${viewportSize}`,
        visionModel,
      )

      return {
        height: screenshot.height,
        imageOcr,
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
        intent: z
          .string()
          .min(1)
          .describe(
            'What to inspect in this screenshot; becomes the vision prompt alongside the ui_to_artifact system prompt, e.g. "check hero spacing and CTA contrast" or "verify mobile nav wraps without clipping".',
          ),
        selector: z
          .string()
          .min(1)
          .max(300)
          .describe(
            'CSS selector for the element to capture, e.g. "body", "main", "#hero", ".pricing-card", or "button[type=submit]".',
          ),
        viewportSize: z
          .enum(SCREENSHOT_VIEWPORT_SIZE_VALUES)
          .describe(
            'Responsive viewport size to render before capture: mobile, tablet, or desktop.',
          ),
      })
      .strict(),
    outputSchema: z.object({
      height: z.number().nullable(),
      imageOcr: ImageOcrSchema,
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
