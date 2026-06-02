import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { AgentResponse } from './agent-request.ts'
import { createSbxOrchestrator, type SbxCommand } from './sbx-orchestrator.ts'
import { createTestConfig, createTestSandbox } from './test-helpers.ts'

const successResponse: AgentResponse = {
  changedFiles: [
    {
      content: 'export function App() {}',
      path: '/src/App.tsx',
    },
  ],
  chatId: 'chat-id',
  deletedPaths: [],
  diagnostics: [],
  message: 'done',
  ok: true,
}

const failedResponse: AgentResponse = {
  diagnostics: ['agent error'],
  error: 'agent error',
  ok: false,
}

describe('createSbxOrchestrator', () => {
  it('creates a sandbox with explicit template and resources', async () => {
    const calls: SbxCommand[] = []
    const orchestrator = createSbxOrchestrator(
      createTestConfig(),
      async (command) => {
        calls.push(command)

        return { exitCode: 0, output: '' }
      },
    )

    await orchestrator.createSandbox(createTestSandbox('/tmp/workspace'))

    expect(calls).toEqual([
      {
        args: [
          'create',
          '--quiet',
          '--name',
          'sandbox-name',
          '--cpus',
          '1',
          '--memory',
          '2g',
          '--template',
          'web-app-creator-sandbox:dev',
          'shell',
          '/tmp/workspace',
        ],
        executable: 'sbx',
        timeoutSeconds: 180,
      },
    ])
  })

  it('runs the in-sandbox agent through fixed request and response paths', async () => {
    const workspacePath = await mkdtemp(
      path.join(tmpdir(), 'web-app-creator-orchestrator-'),
    )
    const calls: SbxCommand[] = []
    const orchestrator = createSbxOrchestrator(
      createTestConfig(),
      async (command) => {
        calls.push(command)

        if (isResponseCopy(command)) {
          await writeResponseFromCopyCommand(command, successResponse)
        }

        return { exitCode: 0, output: '' }
      },
    )

    const response = await orchestrator.runAgent({
      request: {
        files: [{ content: 'source', path: '/src/App.tsx' }],
        prompt: 'Change heading',
        version: 1,
      },
      sandbox: createTestSandbox(workspacePath),
    })

    expect(response).toEqual(successResponse)
    expect(calls.map((call) => call.args[0])).toEqual([
      'exec',
      'cp',
      'exec',
      'cp',
    ])
    expect(calls[1]?.args).toEqual([
      'cp',
      path.join(workspacePath, '.web-app-creator/request.json'),
      'sandbox-name:/workspace/.web-app-creator/request.json',
    ])
    expect(calls[2]?.args).toContain('--workdir')
    expect(calls[2]?.args).toContain('/workspace')
    expect(calls[2]?.args.join(' ')).toContain(
      '/opt/web-app-creator/runner/run-agent.mjs',
    )
    expect(calls[2]?.args).toContain(
      'WEB_APP_CREATOR_MODEL_GATEWAY_BASE_URL=http://host.docker.internal:3001/internal/model-gateway/v1',
    )
    expect(calls[2]?.args).toContain(
      'WEB_APP_CREATOR_MODEL_GATEWAY_TOKEN=token',
    )
    expect(calls[2]?.args).toContain(
      'WEB_APP_CREATOR_MODEL_ID=openrouter/test-model',
    )
    expect(calls[3]?.args).toEqual([
      'cp',
      'sandbox-name:/workspace/.web-app-creator/response.json',
      path.join(workspacePath, '.web-app-creator/response.json'),
    ])
    await expect(
      readFile(
        path.join(workspacePath, '.web-app-creator/request.json'),
        'utf8',
      ),
    ).resolves.toContain('Change heading')
  })

  it('returns an agent error response written by a failed runner', async () => {
    const workspacePath = await mkdtemp(
      path.join(tmpdir(), 'web-app-creator-orchestrator-'),
    )
    const orchestrator = createSbxOrchestrator(
      createTestConfig(),
      async (command) => {
        if (isResponseCopy(command)) {
          await writeResponseFromCopyCommand(command, failedResponse)
        }

        return { exitCode: 0, output: '' }
      },
    )

    await expect(
      orchestrator.runAgent({
        request: {
          files: [],
          prompt: 'Change heading',
          version: 1,
        },
        sandbox: createTestSandbox(workspacePath),
      }),
    ).resolves.toEqual(failedResponse)
  })
})

function isResponseCopy(command: SbxCommand) {
  return (
    command.args[0] === 'cp' &&
    command.args[1] === 'sandbox-name:/workspace/.web-app-creator/response.json'
  )
}

async function writeResponseFromCopyCommand(
  command: SbxCommand,
  response: AgentResponse,
) {
  const responsePath = command.args.at(-1)

  if (!responsePath) {
    throw new Error('Expected response path argument.')
  }

  await import('node:fs/promises').then(({ writeFile }) =>
    writeFile(responsePath, JSON.stringify(response), 'utf8'),
  )
}
