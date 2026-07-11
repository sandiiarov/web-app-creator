import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ToolArgsImages } from './turn-steps'

describe('ToolArgsImages', () => {
  it('renders image arguments with accessible labels', () => {
    const html = renderToStaticMarkup(
      <ToolArgsImages
        images={[
          {
            alt: 'Hero screenshot',
            url: 'https://example.test/hero.png',
          },
        ]}
      />,
    )

    expect(html).toContain('alt="Hero screenshot"')
    expect(html).toContain('src="https://example.test/hero.png"')
  })
})
