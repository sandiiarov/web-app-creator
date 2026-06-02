import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import type { AgentRequest, AgentResponse } from './agent-request.ts'
import type { Config } from './config-env.ts'
import type { ChatSandbox } from './sandbox-chat-registry.ts'

const HOST_CONTROL_DIRECTORY = '.web-app-creator'
const RUNNER_PATH = '/opt/web-app-creator/runner/run-agent.mjs'
const SANDBOX_CONTROL_DIRECTORY = '/workspace/.web-app-creator'
const SANDBOX_REQUEST_FILE = `${SANDBOX_CONTROL_DIRECTORY}/request.json`
const SANDBOX_RESPONSE_FILE = `${SANDBOX_CONTROL_DIRECTORY}/response.json`
const SANDBOX_RUNNER_LOG_FILE = `${SANDBOX_CONTROL_DIRECTORY}/runner.log`
const SANDBOX_WORKSPACE = '/workspace'

export type SbxCommand = {
  args: string[]
  executable: string
  timeoutSeconds: number
}

export type SbxCommandResult = {
  exitCode: null | number
  output: string
}

export type SbxCommandRunner = (
  command: SbxCommand,
) => Promise<SbxCommandResult>

export type SbxOrchestrator = ReturnType<typeof createSbxOrchestrator>

export function createSbxOrchestrator(
  config: Config,
  runCommand: SbxCommandRunner = runSbxCommand,
) {
  return {
    async createSandbox(sandbox: ChatSandbox) {
      await mkdir(sandbox.workspacePath, { recursive: true })

      const result = await runCommand({
        args: [
          'create',
          '--quiet',
          '--name',
          sandbox.sandboxName,
          '--cpus',
          config.sandbox.cpus,
          '--memory',
          config.sandbox.memory,
          '--template',
          config.sandbox.template,
          config.sandbox.agent,
          sandbox.workspacePath,
        ],
        executable: 'sbx',
        timeoutSeconds: config.sandbox.createTimeoutSeconds,
      })

      assertSbxSuccess(result, 'Failed to create sandbox')
    },
    async disposeSandbox(sandbox: ChatSandbox) {
      await runCommand({
        args: ['rm', '--force', sandbox.sandboxName],
        executable: 'sbx',
        timeoutSeconds: config.sandbox.commandTimeoutSeconds,
      })
      await rm(sandbox.workspacePath, { force: true, recursive: true })
    },
    async runAgent({
      request,
      sandbox,
    }: {
      request: AgentRequest
      sandbox: ChatSandbox
    }) {
      const controlDirectory = path.join(
        sandbox.workspacePath,
        HOST_CONTROL_DIRECTORY,
      )
      const requestPath = path.join(controlDirectory, 'request.json')
      const responsePath = path.join(controlDirectory, 'response.json')

      await mkdir(controlDirectory, { recursive: true })
      await writeFile(
        requestPath,
        JSON.stringify(
          {
            request,
          },
          null,
          2,
        ),
        'utf8',
      )

      await runRequiredSbxCommand(runCommand, {
        args: [
          'exec',
          sandbox.sandboxName,
          'sh',
          '-lc',
          `mkdir -p ${SANDBOX_CONTROL_DIRECTORY} && rm -f ${SANDBOX_RESPONSE_FILE} ${SANDBOX_RUNNER_LOG_FILE}`,
        ],
        executable: 'sbx',
        timeoutSeconds: config.sandbox.commandTimeoutSeconds,
      })
      await runRequiredSbxCommand(runCommand, {
        args: [
          'cp',
          requestPath,
          `${sandbox.sandboxName}:${SANDBOX_REQUEST_FILE}`,
        ],
        executable: 'sbx',
        timeoutSeconds: config.sandbox.commandTimeoutSeconds,
      })

      await runRequiredSbxCommand(runCommand, {
        args: [
          'exec',
          '--workdir',
          SANDBOX_WORKSPACE,
          '--env',
          `WEB_APP_CREATOR_MODEL_GATEWAY_BASE_URL=${config.modelGateway.baseUrl}`,
          '--env',
          `WEB_APP_CREATOR_MODEL_GATEWAY_TOKEN=${sandbox.gatewayToken}`,
          '--env',
          `WEB_APP_CREATOR_MODEL_ID=${config.ai.model}`,
          sandbox.sandboxName,
          'sh',
          '-lc',
          `nohup node ${RUNNER_PATH} ${SANDBOX_REQUEST_FILE} ${SANDBOX_RESPONSE_FILE} > ${SANDBOX_RUNNER_LOG_FILE} 2>&1 &`,
        ],
        executable: 'sbx',
        timeoutSeconds: config.sandbox.commandTimeoutSeconds,
      })

      return waitForSandboxResponse({
        responsePath,
        runCommand,
        sandboxName: sandbox.sandboxName,
        timeoutSeconds: config.sandbox.commandTimeoutSeconds,
      })
    },
  }
}

function assertSbxSuccess(result: SbxCommandResult, message: string) {
  if (result.exitCode !== 0) {
    throw new Error(`${message}: ${result.output}`)
  }
}

async function copySandboxResponse({
  responsePath,
  runCommand,
  sandboxName,
  timeoutSeconds,
}: {
  responsePath: string
  runCommand: SbxCommandRunner
  sandboxName: string
  timeoutSeconds: number
}) {
  const result = await runCommand({
    args: ['cp', `${sandboxName}:${SANDBOX_RESPONSE_FILE}`, responsePath],
    executable: 'sbx',
    timeoutSeconds,
  })

  if (result.exitCode !== 0) {
    return undefined
  }

  try {
    return JSON.parse(await readFile(responsePath, 'utf8')) as AgentResponse
  } catch {
    return undefined
  }
}

function createSafeHostEnvironment() {
  const allowedEnvironmentNames = [
    'HOME',
    'LANG',
    'LC_ALL',
    'PATH',
    'SHELL',
    'TERM',
    'TMPDIR',
    'USER',
  ]
  const environment: NodeJS.ProcessEnv = {}

  for (const name of allowedEnvironmentNames) {
    const value = process.env[name]

    if (value) {
      environment[name] = value
    }
  }

  return environment
}

async function runRequiredSbxCommand(
  runCommand: SbxCommandRunner,
  command: SbxCommand,
) {
  assertSbxSuccess(
    await runCommand(command),
    `Failed to run sbx ${command.args[0]}`,
  )
}

async function runSbxCommand({
  args,
  executable,
  timeoutSeconds,
}: SbxCommand): Promise<SbxCommandResult> {
  const { spawn } = await import('node:child_process')

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env: createSafeHostEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const output: Buffer[] = []
    let didTimeout = false
    const timeoutHandle = setTimeout(() => {
      didTimeout = true
      child.kill('SIGTERM')
    }, timeoutSeconds * 1000)

    child.stdout.on('data', (data) => output.push(data))
    child.stderr.on('data', (data) => output.push(data))
    child.on('error', (error) => {
      clearTimeout(timeoutHandle)
      reject(
        new Error(
          `Failed to run ${executable}. Is Docker Sandboxes CLI installed? ${error.message}`,
        ),
      )
    })
    child.on('close', (exitCode) => {
      clearTimeout(timeoutHandle)

      if (didTimeout) {
        reject(new Error(`timeout:${timeoutSeconds}`))
        return
      }

      resolve({
        exitCode,
        output: Buffer.concat(output).toString('utf8'),
      })
    })
  })
}

async function waitForSandboxResponse({
  responsePath,
  runCommand,
  sandboxName,
  timeoutSeconds,
}: {
  responsePath: string
  runCommand: SbxCommandRunner
  sandboxName: string
  timeoutSeconds: number
}) {
  const deadline = Date.now() + timeoutSeconds * 1000

  do {
    const response = await copySandboxResponse({
      responsePath,
      runCommand,
      sandboxName,
      timeoutSeconds,
    })

    if (response) {
      return response
    }

    await sleep(1_000)
  } while (Date.now() < deadline)

  throw new Error(`timeout:${timeoutSeconds}`)
}
