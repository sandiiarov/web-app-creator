/**
 * Ambient types for `@zumer/snapdom-plugins` — the package ships JavaScript only
 * (no `.d.ts`). Shapes modeled on the `agent-map` plugin source (v2.2.0).
 * First-party; no external attribution.
 */

declare module '@zumer/snapdom-plugins/agent-map' {
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

  export interface AgentMapOptions {
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

  export interface AgentMapResult {
    dimensions: { height: number; width: number }
    /** Annotated/raw data URL; absent when `image: false`. */
    image?: string
    map: AgentMapEntry[]
  }

  export function agentMap(
    options?: AgentMapOptions,
  ): import('@zumer/snapdom').SnapdomPlugin
}

declare module '@zumer/snapdom-plugins' {
  export {
    agentMap,
    type AgentMapEntry,
    type AgentMapOptions,
    type AgentMapResult,
  } from '@zumer/snapdom-plugins/agent-map'
}
