import { mkdir, mkdtemp } from 'node:fs/promises'
import path from 'node:path'

import type { AgentRequest, AgentResponse } from './agent-request.ts'
import type { Config } from './config-env.ts'
import type { ChatSandboxRegistry } from './sandbox-chat-registry.ts'
import type { SbxOrchestrator } from './sbx-orchestrator.ts'

export type CleanupIdleSandboxesOptions = Pick<
  RunAgentRequestOptions,
  'config' | 'orchestrator' | 'registry'
>

export type RunAgentRequestOptions = {
  config: Config
  orchestrator: SbxOrchestrator
  registry: ChatSandboxRegistry
  request: AgentRequest
}

export async function cleanupIdleSandboxes({
  config,
  orchestrator,
  registry,
}: CleanupIdleSandboxesOptions) {
  const idleSandboxes = registry.removeIdle(
    config.sandbox.idleTtlSeconds * 1000,
  )

  await Promise.all(
    idleSandboxes.map(async (sandbox) => {
      await orchestrator.disposeSandbox(sandbox)
    }),
  )

  return idleSandboxes
}

export async function runAgentRequest({
  config,
  orchestrator,
  registry,
  request,
}: RunAgentRequestOptions): Promise<AgentResponse> {
  await cleanupIdleSandboxes({ config, orchestrator, registry })

  const sandbox =
    registry.find(request.chatId) ??
    (await createRegisteredSandbox({ config, orchestrator, registry }))

  registry.markStatus(sandbox.chatId, 'running')

  try {
    const response = await orchestrator.runAgent({
      request: {
        ...request,
        chatId: sandbox.chatId,
      },
      sandbox,
    })

    registry.markStatus(sandbox.chatId, 'ready')

    if (!response.ok) {
      return response
    }

    return {
      ...response,
      chatId: sandbox.chatId,
    }
  } catch (error) {
    registry.markStatus(sandbox.chatId, 'failed')
    throw error
  }
}

async function createRegisteredSandbox({
  config,
  orchestrator,
  registry,
}: Pick<RunAgentRequestOptions, 'config' | 'orchestrator' | 'registry'>) {
  await mkdir(config.sandbox.workspaceRoot, { recursive: true })

  const sandbox = registry.create(
    await mkdtemp(path.join(config.sandbox.workspaceRoot, 'chat-')),
  )

  await orchestrator.createSandbox(sandbox)
  registry.markStatus(sandbox.chatId, 'ready')

  return sandbox
}
