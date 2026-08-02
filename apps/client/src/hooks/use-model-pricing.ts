import {
  LANDING_MODEL_GROUPS,
  type LandingModelPricing,
} from '@workspace/prompt-panel/domain'
import { useEffect, useState } from 'react'

import { SERVER_URL } from '../lib/landing-agent'

type ModelPricingMap = Record<string, LandingModelPricing>

/**
 * Base ids of every model the picker supports (text + image + vision
 * options), with routing-variant suffixes stripped. The server scopes its
 * `/api/models` response to exactly these.
 */
const SUPPORTED_MODEL_IDS = [
  ...new Set(
    LANDING_MODEL_GROUPS.flatMap((group) =>
      group.options.map((option) =>
        option.id.replace(/:(?:floor|free|nitro|online)$/, ''),
      ),
    ),
  ),
]

let cached: ModelPricingMap | undefined
let inflight: Promise<ModelPricingMap | undefined> | undefined

/**
 * Live per-1M-token model pricing from the server's OpenRouter catalog proxy
 * (`GET /api/models`). Fetched once per session and shared. `undefined` until
 * loaded or on any failure — the model picker falls back to its bundled
 * static pricing snapshot in that case.
 */
export function useModelPricing() {
  const [pricing, setPricing] = useState(cached)

  useEffect(() => {
    if (cached) return
    inflight ??= fetchModelPricing().then((map) => {
      cached = map
      inflight = undefined
      return map
    })
    let active = true
    void inflight.then((map) => {
      if (active) setPricing(map)
    })
    return () => {
      active = false
    }
  }, [])

  return pricing
}

async function fetchModelPricing(): Promise<ModelPricingMap | undefined> {
  try {
    const response = await fetch(
      `${SERVER_URL}/api/models?ids=${SUPPORTED_MODEL_IDS.join(',')}`,
    )
    if (!response.ok) return undefined
    const body = (await response.json()) as { models?: ModelPricingMap }
    return body.models ?? undefined
  } catch {
    return undefined
  }
}
