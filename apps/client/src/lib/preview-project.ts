import type { VirtualFS } from 'almostnode'

import * as previewAppModule from '../preview-files/App.tsx?raw'
import * as indexHtmlModule from '../preview-files/index.html?raw'
import * as inspectorModule from '../preview-files/inspector.ts?raw'
import * as previewMainModule from '../preview-files/main.tsx?raw'
import type { AgentPreviewFile, AgentResponse } from './agent'
import {
  INSPECTOR_CONTROL_MESSAGE,
  INSPECTOR_SELECTION_MESSAGE,
  INSPECTOR_SHORTCUT_MESSAGE,
} from './inspector-messages'

import * as previewStyleModule from '../preview-files/style.css?raw'

const BIPPY_VERSION = '0.5.41'
const indexHtmlTemplate = indexHtmlModule.default
const inspectorTemplate = inspectorModule.default
const previewAppSource = previewAppModule.default
const previewMainSource = previewMainModule.default
const previewStyleSource = previewStyleModule.default

export const PREVIEW_PORT = 5174

export function applyAgentResponseToPreview(
  vfs: VirtualFS,
  response: AgentResponse,
) {
  if (!response.ok) {
    return
  }

  for (const file of response.changedFiles) {
    vfs.writeFileSync(file.path, file.content)
  }

  for (const deletedPath of response.deletedPaths) {
    if (vfs.existsSync(deletedPath) && vfs.statSync(deletedPath).isFile()) {
      vfs.unlinkSync(deletedPath)
    }
  }
}

export function createViteProject(vfs: VirtualFS) {
  vfs.writeFileSync('/package.json', createPackageJson())
  vfs.writeFileSync('/index.html', createIndexHtml())
  vfs.writeFileSync('/src/main.tsx', previewMainSource)
  vfs.writeFileSync('/src/inspector.ts', createInspectorSource())
  vfs.writeFileSync('/src/App.tsx', previewAppSource)
  vfs.writeFileSync('/src/style.css', previewStyleSource)
}

export function serializePreviewProject(vfs: VirtualFS) {
  const files: AgentPreviewFile[] = []

  for (const rootPath of ['/index.html', '/package.json']) {
    addFileIfPresent(vfs, rootPath, files)
  }

  addDirectoryFiles(vfs, '/src', files)

  return files.sort((first, second) => first.path.localeCompare(second.path))
}

function addDirectoryFiles(
  vfs: VirtualFS,
  directoryPath: string,
  files: AgentPreviewFile[],
) {
  if (
    !vfs.existsSync(directoryPath) ||
    !vfs.statSync(directoryPath).isDirectory()
  ) {
    return
  }

  for (const entry of vfs
    .readdirSync(directoryPath)
    .sort((first, second) => first.localeCompare(second))) {
    const childPath = childVirtualPath(directoryPath, entry)
    const childStats = vfs.statSync(childPath)

    if (childStats.isDirectory()) {
      addDirectoryFiles(vfs, childPath, files)
      continue
    }

    if (childStats.isFile()) {
      addFileIfPresent(vfs, childPath, files)
    }
  }
}

function addFileIfPresent(
  vfs: VirtualFS,
  path: string,
  files: AgentPreviewFile[],
) {
  if (!vfs.existsSync(path) || !vfs.statSync(path).isFile()) {
    return
  }

  files.push({
    content: vfs.readFileSync(path, 'utf8'),
    encoding: 'utf8',
    path,
  })
}

function childVirtualPath(directoryPath: string, entry: string) {
  return directoryPath === '/' ? `/${entry}` : `${directoryPath}/${entry}`
}

function createIndexHtml() {
  return indexHtmlTemplate.replaceAll('__BIPPY_VERSION__', BIPPY_VERSION)
}

function createInspectorSource() {
  return inspectorTemplate
    .replaceAll('__INSPECTOR_CONTROL_MESSAGE__', INSPECTOR_CONTROL_MESSAGE)
    .replaceAll('__INSPECTOR_SELECTION_MESSAGE__', INSPECTOR_SELECTION_MESSAGE)
    .replaceAll('__INSPECTOR_SHORTCUT_MESSAGE__', INSPECTOR_SHORTCUT_MESSAGE)
}

function createPackageJson() {
  return JSON.stringify(
    {
      dependencies: {
        bippy: `^${BIPPY_VERSION}`,
        react: '^19.2.6',
        'react-dom': '^19.2.6',
      },
      devDependencies: {},
      name: 'browser-vite-preview',
      private: true,
      scripts: {
        dev: 'vite',
      },
      type: 'module',
    },
    null,
    2,
  )
}
