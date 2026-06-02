import { execFile } from 'node:child_process'
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent'

import registerWebAppCreatorProvider from '../extensions/web-app-creator-provider.mjs'

const AGENT_DIR = '/opt/web-app-creator/agent'
const CONFIG_ROOT = '/opt/web-app-creator/config'
const CONTROL_DIRECTORY_NAME = '.web-app-creator'
const DEPENDENCY_INSTALL_TIMEOUT_MS = 120_000
const execFileAsync = promisify(execFile)
const GLOBAL_TYPE_ROOTS = [
  '/usr/local/lib/node_modules/@types',
  '/usr/local/share/npm-global/lib/node_modules/@types',
]
const IGNORED_RESPONSE_PATHS = new Set([
  CONTROL_DIRECTORY_NAME,
  'dist',
  'node_modules',
  'package-lock.json',
  'pnpm-lock.yaml',
])
const FORBIDDEN_PREVIEW_PACKAGES = new Set([
  '@earendil-works/pi-ai',
  '@earendil-works/pi-coding-agent',
  '@types/react',
  '@types/react-dom',
  '@typescript/native-preview',
  '@vitejs/plugin-react',
  'oxfmt',
  'oxlint',
  'typescript',
  'vite',
])
const MAX_DIAGNOSTIC_LENGTH = 4_000
const MAX_HARNESS_FIX_ATTEMPTS = 3
const PACKAGE_DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]
const PROJECT_ENTRY_NAMES = ['index.html', 'package.json', 'src']
const REACT_GLOBAL_TYPE_PACKAGES = ['react', 'react-dom']
const TOOL_NAMES = ['read', 'write', 'edit', 'ls', 'find', 'grep', 'bash']
const VALIDATION_TIMEOUT_MS = 120_000

async function addFileContent(workspacePath, absolutePath, files) {
  const previewPath = toPreviewPath(workspacePath, absolutePath)
  files.set(previewPath, await readFile(absolutePath, 'utf8'))
}

function assistantMessageText(message) {
  if (!isAssistantMessage(message)) {
    return ''
  }

  return message.content.map(textContent).join('').trim()
}

function changedPreviewFiles(originalFiles, currentFiles) {
  const changedFiles = []

  for (const [previewPath, content] of currentFiles) {
    if (originalFiles.get(previewPath) !== content) {
      changedFiles.push({ content, encoding: 'utf8', path: previewPath })
    }
  }

  return changedFiles.sort((first, second) =>
    first.path.localeCompare(second.path),
  )
}

async function cleanProjectWorkspace(workspacePath) {
  const entries = await readdir(workspacePath)

  for (const entry of entries) {
    if (entry === CONTROL_DIRECTORY_NAME || entry === 'node_modules') {
      continue
    }

    await rm(path.join(workspacePath, entry), { force: true, recursive: true })
  }
}

async function collectDirectoryEntry(
  workspacePath,
  directoryPath,
  entry,
  files,
) {
  if (IGNORED_RESPONSE_PATHS.has(entry)) {
    return
  }

  const absolutePath = path.join(directoryPath, entry)
  const fileStats = await stat(absolutePath)

  if (fileStats.isDirectory()) {
    await collectDirectoryFiles(workspacePath, absolutePath, files)
    return
  }

  if (fileStats.isFile()) {
    await addFileContent(workspacePath, absolutePath, files)
  }
}

async function collectDirectoryFiles(workspacePath, directoryPath, files) {
  const entries = await readdir(directoryPath)

  for (const entry of entries.sort((first, second) =>
    first.localeCompare(second),
  )) {
    await collectDirectoryEntry(workspacePath, directoryPath, entry, files)
  }
}

async function collectWorkspaceFiles(workspacePath) {
  const files = new Map()

  await collectDirectoryFiles(workspacePath, workspacePath, files)

  return files
}

function commandFailureDetails(error) {
  const output = [error?.stdout, error?.stderr]
    .filter((value) => typeof value === 'string' && value.trim())
    .join('\n')
    .trim()

  return output || errorMessage(error)
}

function createAgentPrompt(request) {
  return [
    'User request:',
    request.prompt,
    '',
    'Selected element context:',
    stringifyJson(request.selectedElement ?? null),
    '',
    'Selected JSX/source excerpt:',
    selectedJsxText(request.selectedJsx),
    '',
    'Preview metadata:',
    stringifyJson(request.preview ?? null),
    '',
    'Files in workspace:',
    ...request.files.map((file) => `- ${file.path}`),
    '',
    'Edit the workspace files to satisfy the request. After your turn, the Pi agent_end hook runs lint, typecheck, format:check, and build. If the hook reports errors, you will receive a follow-up prompt with the failures and must fix them.',
    '',
    'Harness policy:',
    '- Do not add sandbox-global dev tools or type packages to package.json. The sandbox already provides vite, typescript, tsgo, oxlint, oxfmt, @types/react, and @types/react-dom globally.',
    '- Keep preview package.json limited to runtime dependencies needed by the preview app.',
    '- TypeScript source imports may use explicit .ts and .tsx extensions; the harness tsconfig enables them.',
  ].join('\n')
}

function createHarnessExtension(harnessState) {
  return (pi) => {
    pi.on('agent_end', async () => {
      harnessState.lastResult = await runHarness(harnessState.workspacePath)
    })
  }
}

function createHarnessFixPrompt(harnessResult) {
  return [
    'The automated project harness failed after your previous turn.',
    '',
    'Fix the errors below. Use the normal Pi tools to inspect and edit files, then finish when the workspace should pass lint, typecheck, format:check, and build.',
    'Do not add sandbox-global dev tools or type packages to package.json; remove them if present.',
    '',
    formatHarnessFailures(harnessResult),
  ].join('\n')
}

function deletedPreviewPaths(originalFiles, currentFiles) {
  const deletedPaths = []

  for (const previewPath of originalFiles.keys()) {
    if (!currentFiles.has(previewPath)) {
      deletedPaths.push(previewPath)
    }
  }

  return deletedPaths.sort((first, second) => first.localeCompare(second))
}

async function ensureGlobalTypePackage(workspacePath, packageName) {
  const sourcePath = await firstExistingPath(
    GLOBAL_TYPE_ROOTS.map((rootPath) => path.join(rootPath, packageName)),
  )

  if (!sourcePath) {
    return {
      name: 'type-symlinks',
      ok: false,
      output: `Missing global type package: @types/${packageName}`,
    }
  }

  const typeRootPath = path.join(workspacePath, 'node_modules', '@types')
  const targetPath = path.join(typeRootPath, packageName)

  await mkdir(typeRootPath, { recursive: true })
  await rm(targetPath, { force: true, recursive: true })
  await symlink(sourcePath, targetPath, 'dir')

  return undefined
}

async function ensureGlobalTypeSymlinks(workspacePath) {
  const failures = []

  for (const packageName of REACT_GLOBAL_TYPE_PACKAGES) {
    const failure = await ensureGlobalTypePackage(workspacePath, packageName)

    if (failure) {
      failures.push(failure)
    }
  }

  return failures
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

async function existingProjectTargets(workspacePath) {
  const targets = []

  for (const entryName of PROJECT_ENTRY_NAMES) {
    const absolutePath = path.join(workspacePath, entryName)

    if (await hasPath(absolutePath)) {
      targets.push(absolutePath)
    }
  }

  return targets
}

function extractLastAssistantText(messages) {
  return (
    [...messages].reverse().map(assistantMessageText).find(Boolean) ||
    'Agent finished.'
  )
}

async function firstExistingPath(filePaths) {
  for (const filePath of filePaths) {
    if (await hasPath(filePath)) {
      return filePath
    }
  }

  return undefined
}

function formatHarnessFailures(harnessResult) {
  return harnessResult.failures
    .map((failure) => `## ${failure.name}\n${failure.output}`)
    .join('\n\n')
}

async function harnessCheckCommands(workspacePath) {
  const projectTargets = await existingProjectTargets(workspacePath)
  const viteConfigPath = path.join(workspacePath, 'vite.config.ts')
  const viteArgs = (await hasFile(viteConfigPath))
    ? ['build', '--config', viteConfigPath]
    : ['build']

  return [
    {
      args: [
        '-c',
        path.join(CONFIG_ROOT, 'oxlint.config.ts'),
        ...projectTargets,
      ],
      executable: 'oxlint',
      name: 'lint',
    },
    {
      args: ['--noEmit', '-p', path.join(CONFIG_ROOT, 'tsconfig.preview.json')],
      executable: 'tsgo',
      name: 'typecheck',
    },
    {
      args: [
        '-c',
        path.join(CONFIG_ROOT, 'oxfmt.config.ts'),
        '--check',
        ...projectTargets,
      ],
      executable: 'oxfmt',
      name: 'format:check',
    },
    {
      args: viteArgs,
      executable: 'vite',
      name: 'build',
    },
  ]
}

async function harnessFixCommands(workspacePath) {
  const projectTargets = await existingProjectTargets(workspacePath)

  return [
    {
      args: [
        '-c',
        path.join(CONFIG_ROOT, 'oxfmt.config.ts'),
        ...projectTargets,
      ],
      executable: 'oxfmt',
      name: 'format',
    },
    {
      args: [
        '-c',
        path.join(CONFIG_ROOT, 'oxlint.config.ts'),
        '--fix',
        ...projectTargets,
      ],
      executable: 'oxlint',
      name: 'lint:fix',
    },
  ]
}

async function hasFile(filePath) {
  try {
    const fileStats = await stat(filePath)

    return fileStats.isFile()
  } catch {
    return false
  }
}

async function hasPath(filePath) {
  try {
    await stat(filePath)

    return true
  } catch {
    return false
  }
}

async function installDependencies(workspacePath, diagnostics) {
  try {
    await stat(path.join(workspacePath, 'package.json'))
  } catch {
    return
  }

  try {
    await execFileAsync('pnpm', ['install', '--ignore-scripts'], {
      cwd: workspacePath,
      maxBuffer: 2_000_000,
      timeout: DEPENDENCY_INSTALL_TIMEOUT_MS,
    })
  } catch (error) {
    diagnostics.push(`Dependency install failed: ${errorMessage(error)}`)
  }
}

function isAssistantMessage(message) {
  return message?.role === 'assistant' && Array.isArray(message.content)
}

function isTextContent(content) {
  return content?.type === 'text' && typeof content.text === 'string'
}

function lastAssistantMessage(messages) {
  return [...messages].reverse().find(isAssistantMessage)
}

async function main() {
  const [requestPath, responsePath] = process.argv.slice(2)

  if (!requestPath || !responsePath) {
    throw new Error('Usage: run-agent.mjs <request.json> <response.json>')
  }

  const payload = JSON.parse(await readFile(requestPath, 'utf8'))
  const workspacePath = process.cwd()
  const diagnostics = []

  await materializeSnapshot(workspacePath, payload.request.files)
  await installDependencies(workspacePath, diagnostics)

  const originalFiles = new Map(
    payload.request.files.map((file) => [file.path, file.content]),
  )
  const agentResult = await runPiAgent({
    request: payload.request,
    workspacePath,
  })
  diagnostics.push(...agentResult.diagnostics)

  const currentFiles = await collectWorkspaceFiles(workspacePath)
  const changedFiles = changedPreviewFiles(originalFiles, currentFiles)
  const deletedPaths = deletedPreviewPaths(originalFiles, currentFiles)

  await mkdir(path.dirname(responsePath), { recursive: true })
  await writeFile(
    responsePath,
    JSON.stringify(
      {
        changedFiles,
        chatId: payload.request.chatId,
        deletedPaths,
        diagnostics,
        message: agentResult.message,
        ok: true,
      },
      null,
      2,
    ),
    'utf8',
  )
}

async function materializeSnapshot(workspacePath, files) {
  await cleanProjectWorkspace(workspacePath)

  for (const file of files) {
    const filePath = workspaceFilePath(workspacePath, file.path)

    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, file.content, 'utf8')
  }
}

async function previewPackagePolicyFailures(workspacePath) {
  const packageJsonPath = path.join(workspacePath, 'package.json')

  if (!(await hasFile(packageJsonPath))) {
    return []
  }

  try {
    return previewPackagePolicyFailuresForPayload(
      JSON.parse(await readFile(packageJsonPath, 'utf8')),
    )
  } catch (error) {
    return [
      {
        name: 'package-policy',
        ok: false,
        output: `Failed to parse package.json: ${errorMessage(error)}`,
      },
    ]
  }
}

// fallow-ignore-next-line complexity
function previewPackagePolicyFailuresForPayload(packageJson) {
  const forbiddenEntries = []

  for (const fieldName of PACKAGE_DEPENDENCY_FIELDS) {
    const dependencies = packageJson?.[fieldName]

    if (!dependencies || typeof dependencies !== 'object') {
      continue
    }

    for (const packageName of Object.keys(dependencies)) {
      if (FORBIDDEN_PREVIEW_PACKAGES.has(packageName)) {
        forbiddenEntries.push(`${fieldName}.${packageName}`)
      }
    }
  }

  return forbiddenEntries.length === 0
    ? []
    : [
        {
          name: 'package-policy',
          ok: false,
          output: [
            'Preview package.json must not include sandbox-global dev tools or type packages.',
            'Remove these entries:',
            ...forbiddenEntries.map((entry) => `- ${entry}`),
          ].join('\n'),
        },
      ]
}

function requiredEnv(name) {
  const value = process.env[name]

  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

async function runCommandGroup(commands, workspacePath) {
  const failures = []

  for (const command of commands) {
    const result = await runCommandSpec(command, workspacePath)

    if (!result.ok) {
      failures.push(result)
    }
  }

  return {
    diagnostics: [],
    failures,
    ok: failures.length === 0,
  }
}

async function runCommandSpec(command, workspacePath) {
  try {
    await execFileAsync(command.executable, command.args, {
      cwd: workspacePath,
      maxBuffer: 2_000_000,
      timeout: VALIDATION_TIMEOUT_MS,
    })

    return {
      name: command.name,
      ok: true,
      output: '',
    }
  } catch (error) {
    return {
      name: command.name,
      ok: false,
      output: truncateDiagnostic(commandFailureDetails(error)),
    }
  }
}

// fallow-ignore-next-line complexity
async function runHarness(workspacePath) {
  const typeSymlinkFailures = await ensureGlobalTypeSymlinks(workspacePath)

  if (typeSymlinkFailures.length > 0) {
    return {
      diagnostics: [],
      failures: typeSymlinkFailures,
      ok: false,
    }
  }

  const policyFailures = await previewPackagePolicyFailures(workspacePath)

  if (policyFailures.length > 0) {
    return {
      diagnostics: [],
      failures: policyFailures,
      ok: false,
    }
  }

  const checkResult = await runCommandGroup(
    await harnessCheckCommands(workspacePath),
    workspacePath,
  )

  if (!checkResult.ok) {
    return checkResult
  }

  const fixResult = await runCommandGroup(
    await harnessFixCommands(workspacePath),
    workspacePath,
  )

  if (!fixResult.ok) {
    return fixResult
  }

  return runCommandGroup(
    await harnessCheckCommands(workspacePath),
    workspacePath,
  )
}

// fallow-ignore-next-line complexity
async function runPiAgent({ request, workspacePath }) {
  const authStorage = AuthStorage.inMemory()
  const gatewayToken = requiredEnv('WEB_APP_CREATOR_MODEL_GATEWAY_TOKEN')
  const harnessState = {
    lastResult: undefined,
    workspacePath,
  }
  const modelId = requiredEnv('WEB_APP_CREATOR_MODEL_ID')

  authStorage.setRuntimeApiKey('web-app-creator', gatewayToken)

  const modelRegistry = ModelRegistry.inMemory(authStorage)
  registerWebAppCreatorProvider({
    registerProvider: (providerName, providerConfig) =>
      modelRegistry.registerProvider(providerName, providerConfig),
  })

  const model = modelRegistry.find('web-app-creator', modelId)

  if (!model) {
    throw new Error(`Model not registered: ${modelId}`)
  }

  const sessionManager = SessionManager.continueRecent(
    workspacePath,
    path.join(workspacePath, CONTROL_DIRECTORY_NAME, 'session-state'),
  )
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    defaultModel: modelId,
    defaultProvider: 'web-app-creator',
    images: { blockImages: true },
    retry: {
      enabled: true,
      maxRetries: 1,
      provider: {
        maxRetries: 1,
        timeoutMs: 120_000,
      },
    },
  })
  const resourceLoader = new DefaultResourceLoader({
    agentDir: AGENT_DIR,
    cwd: workspacePath,
    extensionFactories: [createHarnessExtension(harnessState)],
    settingsManager,
  })

  await resourceLoader.reload()

  const { session } = await createAgentSession({
    agentDir: AGENT_DIR,
    authStorage,
    cwd: workspacePath,
    model,
    modelRegistry,
    resourceLoader,
    sessionManager,
    settingsManager,
    thinkingLevel: 'off',
    tools: TOOL_NAMES,
  })

  try {
    for (let attempt = 0; attempt <= MAX_HARNESS_FIX_ATTEMPTS; attempt += 1) {
      const prompt = harnessState.lastResult
        ? createHarnessFixPrompt(harnessState.lastResult)
        : createAgentPrompt(request)

      await session.prompt(prompt, {
        expandPromptTemplates: false,
        source: 'rpc',
      })

      throwIfModelFailed(session.messages)

      if (!harnessState.lastResult) {
        throw new Error('Agent finish harness did not run.')
      }

      if (harnessState.lastResult.ok) {
        return {
          diagnostics: harnessState.lastResult.diagnostics,
          message: extractLastAssistantText(session.messages),
        }
      }
    }

    throw new Error(
      `Harness failed after ${MAX_HARNESS_FIX_ATTEMPTS + 1} attempts.\n${formatHarnessFailures(harnessState.lastResult)}`,
    )
  } finally {
    session.dispose()
  }
}

function selectedJsxText(value) {
  if (typeof value !== 'string') {
    return 'Not provided.'
  }

  return value.trim() || 'Not provided.'
}

function stringifyJson(value) {
  return JSON.stringify(value, null, 2)
}

function textContent(content) {
  return isTextContent(content) ? content.text : ''
}

function throwIfModelFailed(messages) {
  const assistantMessage = lastAssistantMessage(messages)

  if (assistantMessage?.stopReason === 'error') {
    throw new Error(
      `Model request failed: ${assistantMessage.errorMessage ?? 'unknown error'}`,
    )
  }
}

function toPreviewPath(workspacePath, absolutePath) {
  return `/${path.relative(workspacePath, absolutePath).split(path.sep).join('/')}`
}

function truncateDiagnostic(value) {
  return value.length > MAX_DIAGNOSTIC_LENGTH
    ? `${value.slice(0, MAX_DIAGNOSTIC_LENGTH)}…`
    : value
}

function workspaceFilePath(workspacePath, previewPath) {
  const segments = previewPath
    .split(/[\\/]+/u)
    .filter((segment) => segment && segment !== '.' && segment !== '..')

  return path.join(workspacePath, ...segments)
}

main().catch(async (error) => {
  const responsePath = process.argv[3]

  if (responsePath) {
    await mkdir(path.dirname(responsePath), { recursive: true })
    await writeFile(
      responsePath,
      JSON.stringify(
        {
          diagnostics: [errorMessage(error)],
          error: errorMessage(error),
          ok: false,
        },
        null,
        2,
      ),
      'utf8',
    )
  }

  console.error(error)
  process.exitCode = 1
})
