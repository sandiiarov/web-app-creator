import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import type { BrowserScreenshotResult } from '../lib/browser-screenshot.ts'
import { ocrImageInputs } from '../lib/image-ocr.ts'

const SCREENSHOT_TIMEOUT_MS = 25_000
const SCREENSHOT_VIEWPORT_SIZE_VALUES = ['mobile', 'tablet', 'desktop'] as const

const SCREENSHOT_OCR_PROMPT =
  'Analyze this rendered landing-page element screenshot. Extract visible text, then describe layout, hierarchy, spacing, colors, typography, imagery, component states, responsive issues, visual bugs, and concrete improvement opportunities. Treat this as browser-rendered QA feedback for editing the project HTML document.'

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
) {
  return createTool({
    description:
      'Request a browser-rendered screenshot of one element in the current project HTML document, then OCR/analyze it with vision. Accepts exactly two arguments: a CSS element selector and viewportSize (mobile, tablet, or desktop). Use after substantial edits or when you need visual feedback about layout, text, spacing, contrast, clipping, or responsive issues. Returns a padded element screenshot OCR/visual transcript; it does not create files.',
    execute: async ({ selector, viewportSize }) => {
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
        `${SCREENSHOT_OCR_PROMPT}\nTarget selector: ${selector}\nViewport size: ${viewportSize}`,
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
