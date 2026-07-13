import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { captureProjectSelectors } from './project-screenshot.ts'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(MODULE_DIR, '..', '..', '..', '.env')

async function loadEnv() {
  try {
    const text = await readFile(ENV_PATH, 'utf8')
    for (const line of text.split('\n')) {
      const match = /^([A-Z_]+)=(.*)$/.exec(line.trim())
      if (match && match[1] && match[2]) {
        process.env[match[1]] = match[2]
      }
    }
  } catch {
    // .env is app-local and may be absent; the test skips when credentials are missing.
  }
}

const shouldRun = process.env.RUN_CLOUDFLARE_SMOKE === '1'

describe.skipIf(!shouldRun)('Cloudflare Browser Run live smoke', () => {
  it('captures three viewports for two selectors and closes the browser', async () => {
    await loadEnv()

    const html = `<!doctype html><html><head><style>
body { margin:0; font-family:Arial,sans-serif; }
.hero { padding:40px; background:#0ea5e9; color:#fff; }
.hero h1 { font-size:32px; }
.cta { display:inline-block; margin-top:16px; padding:12px 24px; background:#fff; color:#0ea5e9; border-radius:8px; text-decoration:none; }
</style></head><body><div class="hero"><h1>Cloudflare Capture Smoke</h1><a class="cta" href="#">Get Started</a></div></body></html>`

    const result = await captureProjectSelectors(
      {
        html,
        projectId: 'smoke-test',
        selectors: ['.hero', 'body'],
        timeoutMs: 30_000,
      },
      {
        cloudflare: {
          accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
          apiToken: process.env.CLOUDFLARE_API_TOKEN,
        },
      },
    )

    expect(result).toHaveLength(2)
    for (const selector of result) {
      expect(selector.captures).toHaveLength(3)
      expect(selector.captures.map((c) => c.viewport)).toEqual([
        'mobile',
        'tablet',
        'desktop',
      ])
      for (const capture of selector.captures) {
        expect(capture.dataUrl).toMatch(/^data:image\/jpeg;base64,/)
        expect(capture.width).toBeGreaterThan(0)
        expect(capture.height).toBeGreaterThan(0)
        expect(capture.mediaType).toBe('image/jpeg')
      }
    }

    // The CTA link should appear in the hero's element map.
    const heroMap = result[0]!.captures[0]!.elementMap
    expect(heroMap).toContain('link')
    expect(heroMap).toContain('Get Started')
  })
})
