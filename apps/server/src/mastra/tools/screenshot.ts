import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { config } from '../../config.ts'
import { ocrImageInputs } from '../lib/image-ocr.ts'
import type {
  CapturedProjectScreenshot,
  CapturedProjectSelector,
} from '../lib/project-screenshot.ts'

export type RequestProjectScreenshot = (
  selector: string,
  signal?: AbortSignal,
) => Promise<CapturedProjectSelector>

/**
 * Recover screenshot args from malformed tool-call input. GLM-5.2 sometimes
 * streams selector/action wrapped in arg_key/arg_value tags that collapse the
 * JSON into one mangled key, and occasionally passes the whole object as a JSON
 * string. Regex-extract the intended values so a usable screenshot call lands
 * instead of a validation error plus retry.
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
    if (typeof candidate.selector === 'string') {
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
  captureProjectSelector?: RequestProjectScreenshot,
  visionModel: string = config.openrouter.defaultVisionModel,
) {
  return createTool({
    description:
      'Request a browser-rendered screenshot of one element in the current project HTML document, then OCR/analyze it with vision. Accepts two arguments: a CSS element selector and an action describing what to inspect. The tool automatically captures the element at three viewport sizes (mobile 390×844, tablet 768×1024, and desktop 1440×900) in a single isolated browser session, so you get responsive feedback in one call. The action becomes the vision prompt alongside the Z.AI ui_to_artifact system prompt, so state precisely what feedback you need (e.g. "check hero spacing and CTA contrast", "verify mobile nav wraps without clipping"). Each capture is annotated with numbered red badges on interactive elements, and the result includes per-viewport elementMaps listing every badge (index → role / accessible name / bounding box / state), so reference elements by index (e.g. "the CTA at badge 0"). Returns per-viewport padded screenshots plus OCR/visual transcripts and elementMaps; it does not create files.',
    execute: async (rawInput) => {
      const { action, selector } = recoverScreenshotArgs(rawInput) as {
        action?: string
        selector?: string
      }
      if (!selector) {
        return {
          captures: [],
          imageOcr: {
            imagesAnalyzed: 0,
            ok: false,
            reason: 'screenshot requires a selector (a CSS element selector).',
            text: '',
            usage: null,
          },
          ok: false,
          reason: 'screenshot requires a selector (a CSS element selector).',
          selector: selector ?? '',
          text: '',
        }
      }
      if (!captureProjectSelector) {
        return {
          captures: [],
          imageOcr: {
            imagesAnalyzed: 0,
            ok: false,
            reason: 'Screenshot capture is unavailable in this runtime.',
            text: '',
            usage: null,
          },
          ok: false,
          reason: 'Screenshot capture is unavailable in this runtime.',
          selector,
          text: '',
        }
      }

      let captured: CapturedProjectSelector
      try {
        captured = await captureProjectSelector(selector)
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : 'Screenshot capture failed.'
        return {
          captures: [],
          imageOcr: {
            imagesAnalyzed: 0,
            ok: false,
            reason,
            text: '',
            usage: null,
          },
          ok: false,
          reason,
          selector,
          text: '',
        }
      }

      const imageOcr = await ocrImageInputs(
        captured.captures.map((capture) => ({
          dataUrl: capture.dataUrl,
          sourceLabel: `browser screenshot ${capture.width}×${capture.height} of ${selector} at ${capture.viewport} viewport`,
        })),
        `${action ?? 'Inspect this element for layout, spacing, contrast, and responsive issues across all three viewports.'}\nTarget selector: ${selector}\nViewports: mobile, tablet, desktop`,
        visionModel,
      )

      return {
        captures: captured.captures.map(stripCaptureDataUrl),
        imageOcr,
        ok: imageOcr.ok,
        reason: imageOcr.reason,
        selector,
        text: imageOcr.text,
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
            'CSS selector for the element to capture, e.g. "body", "main", "#hero", ".pricing-card", or "button[type=submit]". The element is captured at mobile, tablet, and desktop viewports in one call.',
          ),
      })
      .passthrough(),
    outputSchema: z.object({
      captures: z.array(
        z.object({
          elementMap: z.string(),
          height: z.number(),
          imageUrl: z.string(),
          viewport: z.enum(['desktop', 'mobile', 'tablet']),
          width: z.number(),
        }),
      ),
      imageOcr: ImageOcrSchema,
      ok: z.boolean(),
      reason: z.string().optional(),
      selector: z.string(),
      text: z.string(),
    }),
    strict: true,
  })
}

/** Strip the internal data URL from a capture before returning it as a tool result. */
function stripCaptureDataUrl(
  capture: CapturedProjectScreenshot,
): Omit<CapturedProjectScreenshot, 'dataUrl'> {
  return {
    elementMap: capture.elementMap,
    height: capture.height,
    imageUrl: capture.imageUrl,
    mediaType: capture.mediaType,
    viewport: capture.viewport,
    width: capture.width,
  }
}
