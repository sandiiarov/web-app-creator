import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import type { BrowserScreenshotResult } from '../lib/browser-screenshot.ts'
import { ocrImageInputs } from '../lib/image-ocr.ts'

const DEFAULT_SCREENSHOT_HEIGHT = 900
const DEFAULT_SCREENSHOT_WIDTH = 1440
const SCREENSHOT_TIMEOUT_MS = 25_000

const SCREENSHOT_OCR_PROMPT =
  'Analyze this rendered landing-page screenshot. Extract visible text, then describe layout, hierarchy, spacing, colors, typography, imagery, component states, responsive issues, visual bugs, and concrete improvement opportunities. Treat this as browser-rendered QA feedback for editing /index.html.'

export interface BrowserScreenshotRequestInput {
  height: number
  intent: string
  timeoutMs: number
  width: number
}

export type RequestBrowserScreenshot = (
  input: BrowserScreenshotRequestInput,
) => Promise<BrowserScreenshotResult>

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
      'Request a browser-rendered screenshot of the current /index.html, then OCR/analyze it with vision. Use after substantial edits or when you need visual feedback about layout, text, spacing, contrast, clipping, or responsive issues. Always pass an intent describing what you are checking. Returns a screenshot OCR/visual transcript; it does not create files.',
    execute: async ({ height, intent, width }) => {
      if (!requestScreenshot) {
        return {
          height: height ?? DEFAULT_SCREENSHOT_HEIGHT,
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
          text: '',
          width: width ?? DEFAULT_SCREENSHOT_WIDTH,
        }
      }

      const requestedHeight = height ?? DEFAULT_SCREENSHOT_HEIGHT
      const requestedWidth = width ?? DEFAULT_SCREENSHOT_WIDTH

      let screenshot: BrowserScreenshotResult
      try {
        screenshot = await requestScreenshot({
          height: requestedHeight,
          intent,
          timeoutMs: SCREENSHOT_TIMEOUT_MS,
          width: requestedWidth,
        })
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : 'Screenshot capture failed.'
        return {
          height: requestedHeight,
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
          text: '',
          width: requestedWidth,
        }
      }

      const imageOcr = await ocrImageInputs(
        [
          {
            dataUrl: screenshot.dataUrl,
            sourceLabel: `browser screenshot ${screenshot.width}×${screenshot.height}`,
          },
        ],
        SCREENSHOT_OCR_PROMPT,
      )

      return {
        height: screenshot.height,
        imageOcr,
        mediaType: screenshot.mediaType,
        ok: imageOcr.ok,
        reason: imageOcr.reason,
        text: imageOcr.text,
        width: screenshot.width,
      }
    },
    id: 'screenshot',
    inputSchema: z.object({
      height: z
        .number()
        .int()
        .min(240)
        .max(4096)
        .optional()
        .describe('Viewport height in CSS pixels (default 900).'),
      intent: z
        .string()
        .describe(
          'Short reason for the screenshot (shown to the user), e.g. "check hero composition after edits"',
        ),
      width: z
        .number()
        .int()
        .min(320)
        .max(4096)
        .optional()
        .describe('Viewport width in CSS pixels (default 1440).'),
    }),
    outputSchema: z.object({
      height: z.number(),
      imageOcr: ImageOcrSchema,
      mediaType: z.nullable(z.enum(['image/jpeg', 'image/png', 'image/webp'])),
      ok: z.boolean(),
      reason: z.string().optional(),
      text: z.string(),
      width: z.number(),
    }),
  })
}
