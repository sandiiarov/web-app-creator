import type { SnapdomPlugin } from '@zumer/snapdom'

/**
 * Typed wrapper for the `@zumer/snapdom-plugins` agent-map plugin. The package
 * ships JavaScript only (no `.d.ts`), so the factory is imported with a
 * suppressed missing-types error and cast to a typed signature. Shapes are
 * modeled on the agent-map plugin source (v2.2.0). First-party; no external
 * attribution.
 *
 * This is a regular module (not an ambient `declare module` in a `.d.ts`) so
 * the types travel with the import graph into every consumer that
 * source-imports this package — ambient declarations in a `.d.ts` are only
 * loaded by the tsconfig that includes them, which breaks cross-package
 * typecheck for source-consumed packages like this one.
 */

/** Minimal Set-of-Marks entry: index, accessible-name, role, bbox, state. */
export interface AgentMapEntry {
  /** Bounding box relative to the captured root: [x, y, width, height]. */
  b: [number, number, number, number]
  /** Badge index (matches the number drawn on the annotated image). */
  i: number
  /** Accessible name (aria-label / text / title / label). */
  n: string
  /** Derived role (explicit role, else tag-derived, e.g. button/link/heading). */
  r: string
  /** Meaningful states only (checked/disabled/focus/expanded/pressed/selected/value/covered). */
  s?: Record<string, unknown>
}

export interface AgentMapResult {
  dimensions: { height: number; width: number }
  /** Annotated/raw data URL; absent when `image: false`. */
  image?: string
  map: AgentMapEntry[]
}

interface AgentMapOptions {
  /** 'minimal' = {i,n,r,b,s?}; 'full' adds text + attrs. */
  fields?: 'full' | 'minimal'
  /** 'annotated' draws numbered badges; 'raw' omits badges; false skips rasterize. */
  image?: 'annotated' | 'raw' | false
  imageFormat?: 'jpg' | 'png' | 'webp'
  imageQuality?: number
  interactiveSelector?: string
  labelStyle?: Record<string, string>
  /** Downscale target for the rasterized image. */
  maxImageWidth?: number
  /** Include non-interactive semantic elements (headings, landmarks, paragraphs). */
  semantic?: boolean
  semanticSelector?: string
}

// @ts-expect-error — @zumer/snapdom-plugins ships JavaScript only (no types).
import { agentMap as rawAgentMap } from '@zumer/snapdom-plugins/agent-map'

/**
 * Typed agent-map plugin factory. The runtime export is untyped; this casts it
 * so call-sites get option checking and a `SnapdomPlugin` return type.
 */
export const agentMap = rawAgentMap as (
  options?: AgentMapOptions,
) => SnapdomPlugin
