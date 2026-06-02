import { VirtualFS } from 'almostnode'
import { describe, expect, it } from 'vitest'

import {
  applyAgentResponseToPreview,
  createViteProject,
  PREVIEW_PORT,
  serializePreviewProject,
} from './preview-project'

describe('applyAgentResponseToPreview', () => {
  it('writes changed files and deletes removed files', () => {
    const vfs = new VirtualFS()

    createViteProject(vfs)
    vfs.writeFileSync('/src/old.ts', 'old')

    applyAgentResponseToPreview(vfs, {
      changedFiles: [
        {
          content: 'new',
          encoding: 'utf8',
          path: '/src/new.ts',
        },
      ],
      deletedPaths: ['/src/old.ts'],
      diagnostics: [],
      message: 'Done',
      ok: true,
    })

    expect(vfs.readFileSync('/src/new.ts', 'utf8')).toBe('new')
    expect(vfs.existsSync('/src/old.ts')).toBe(false)
  })

  it('ignores failed responses', () => {
    const vfs = new VirtualFS()

    createViteProject(vfs)
    applyAgentResponseToPreview(vfs, {
      error: 'Nope',
      ok: false,
    })

    expect(vfs.existsSync('/src/App.tsx')).toBe(true)
  })
})

describe('createViteProject', () => {
  it('seeds a browser Vite project into the virtual filesystem', () => {
    const vfs = new VirtualFS()

    createViteProject(vfs)

    expect(PREVIEW_PORT).toBe(5174)
    expect(vfs.existsSync('/package.json')).toBe(true)
    expect(vfs.existsSync('/index.html')).toBe(true)
    expect(vfs.existsSync('/src/App.tsx')).toBe(true)
    expect(vfs.existsSync('/src/inspector.ts')).toBe(true)
    expect(vfs.existsSync('/src/main.tsx')).toBe(true)
    expect(vfs.existsSync('/src/style.css')).toBe(true)
  })

  it('materializes template placeholders for bippy and inspector messages', () => {
    const vfs = new VirtualFS()

    createViteProject(vfs)

    const indexHtml = vfs.readFileSync('/index.html', 'utf8')
    const inspector = vfs.readFileSync('/src/inspector.ts', 'utf8')

    expect(indexHtml).toContain('bippy@0.5.41')
    expect(indexHtml).not.toContain('__BIPPY_VERSION__')
    expect(inspector).toContain('web-app-creator:inspector-control')
    expect(inspector).toContain('web-app-creator:element-selected')
    expect(inspector).toContain('web-app-creator:inspector-shortcut')
    expect(inspector).not.toContain('__INSPECTOR_')
  })

  it('writes a package manifest for the in-memory preview app', () => {
    const vfs = new VirtualFS()

    createViteProject(vfs)

    expect(JSON.parse(vfs.readFileSync('/package.json', 'utf8'))).toMatchObject(
      {
        dependencies: {
          bippy: '^0.5.41',
          react: '^19.2.6',
          'react-dom': '^19.2.6',
        },
        name: 'browser-vite-preview',
        private: true,
        type: 'module',
      },
    )
  })
})

describe('serializePreviewProject', () => {
  it('serializes root files and nested source files', () => {
    const vfs = new VirtualFS()

    createViteProject(vfs)
    vfs.writeFileSync('/src/components/Card.tsx', 'export function Card() {}')

    expect(serializePreviewProject(vfs).map((file) => file.path)).toEqual([
      '/index.html',
      '/package.json',
      '/src/App.tsx',
      '/src/components/Card.tsx',
      '/src/inspector.ts',
      '/src/main.tsx',
      '/src/style.css',
    ])
  })
})
