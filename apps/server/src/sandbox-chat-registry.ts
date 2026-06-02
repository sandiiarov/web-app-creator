import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

export type ChatSandbox = {
  chatId: string
  createdAt: number
  gatewayToken: string
  lastUsedAt: number
  sandboxName: string
  status: ChatSandboxStatus
  workspacePath: string
}

export type ChatSandboxRegistry = ReturnType<typeof createChatSandboxRegistry>

export type ChatSandboxStatus = 'creating' | 'failed' | 'ready' | 'running'

export type CreateChatSandboxRegistryOptions = {
  clock?: () => number
  idFactory?: () => string
  nameFactory?: (chatId: string) => string
  tokenFactory?: () => string
}

export function createChatSandboxRegistry({
  clock = Date.now,
  idFactory = randomUUID,
  nameFactory = defaultSandboxName,
  tokenFactory = createGatewayToken,
}: CreateChatSandboxRegistryOptions = {}) {
  const sandboxes = new Map<string, ChatSandbox>()

  return {
    create(workspacePath: string) {
      const chatId = idFactory()
      const now = clock()
      const sandbox: ChatSandbox = {
        chatId,
        createdAt: now,
        gatewayToken: tokenFactory(),
        lastUsedAt: now,
        sandboxName: nameFactory(chatId),
        status: 'creating',
        workspacePath,
      }

      sandboxes.set(chatId, sandbox)

      return sandbox
    },
    delete(chatId: string) {
      return sandboxes.delete(chatId)
    },
    find(chatId: string | undefined) {
      if (!chatId) {
        return undefined
      }

      const sandbox = sandboxes.get(chatId)

      if (sandbox) {
        sandbox.lastUsedAt = clock()
      }

      return sandbox
    },
    findByGatewayToken(token: string | undefined) {
      if (!token) {
        return undefined
      }

      for (const sandbox of sandboxes.values()) {
        if (safeEqual(sandbox.gatewayToken, token)) {
          sandbox.lastUsedAt = clock()
          return sandbox
        }
      }

      return undefined
    },
    list() {
      return [...sandboxes.values()]
    },
    markStatus(chatId: string, status: ChatSandboxStatus) {
      const sandbox = sandboxes.get(chatId)

      if (!sandbox) {
        return undefined
      }

      sandbox.lastUsedAt = clock()
      sandbox.status = status

      return sandbox
    },
    removeIdle(maxIdleMs: number) {
      const now = clock()
      const removed: ChatSandbox[] = []

      for (const sandbox of sandboxes.values()) {
        if (now - sandbox.lastUsedAt <= maxIdleMs) {
          continue
        }

        sandboxes.delete(sandbox.chatId)
        removed.push(sandbox)
      }

      return removed
    },
  }
}

function createGatewayToken() {
  return randomBytes(32).toString('base64url')
}

function defaultSandboxName(chatId: string) {
  return `web-app-creator-${chatId.replaceAll(/[^a-zA-Z0-9.+-]/g, '-').slice(0, 48)}`
}

function safeEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first)
  const secondBuffer = Buffer.from(second)

  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  )
}
