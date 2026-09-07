import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { createApiServer } from '../index.ts'
import { createRuntimeFixture } from './runtime-fixture.ts'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
let releaseRun!: () => void
let runRelease = new Promise<void>((resolve) => {
  releaseRun = resolve
})

const fixture = await createRuntimeFixture({
  createAgentSdkRuntime: async () => ({
    createAgent: (() => ({
      async stream(_message: unknown, options: { abortSignal: AbortSignal }) {
        return {
          finishReason: Promise.resolve('stop'),
          fullStream: (async function* () {
            yield {
              payload: { text: 'The deterministic fixture is working.' },
              type: 'text-delta',
            }
            await Promise.race([
              runRelease,
              new Promise<void>((resolve) =>
                options.abortSignal.addEventListener('abort', () => resolve(), {
                  once: true,
                }),
              ),
            ])
          })(),
          usage: Promise.resolve({
            cachedInputTokens: 0,
            inputTokens: 4,
            outputTokens: 6,
            totalTokens: 10,
          }),
        }
      },
    })) as never,
    async deleteProjectMemory() {},
    async dispose() {},
    memory: { async deleteThread() {} },
  }),
})
const project = await fixture.runtime.projectService.create({
  creationKey: PROJECT_ID,
  title: 'Protocol browser fixture',
})
fixture.runtime.repository.createProjectHtmlStore(project.id)
  .set(`<!doctype html>
<html><head><title>Protocol fixture</title></head><body><main><h1>Protocol fixture</h1><p>Safe deterministic browser QA.</p></main></body></html>`)

const api = createApiServer(fixture.runtime)
await listen(api)
const apiPort = (api.address() as AddressInfo).port
const control = createServer((request, response) => {
  if (request.url === '/release' && request.method === 'POST') {
    releaseRun()
    response.end('released\n')
    return
  }
  if (request.url === '/reset' && request.method === 'POST') {
    runRelease = new Promise<void>((resolve) => {
      releaseRun = resolve
    })
    response.end('reset\n')
    return
  }
  if (request.url === '/shutdown' && request.method === 'POST') {
    response.end('shutting down\n')
    setImmediate(() => void shutdown())
    return
  }
  response.setHeader('content-type', 'application/json')
  response.end(
    JSON.stringify({
      apiUrl: `http://127.0.0.1:${apiPort}`,
      projectId: PROJECT_ID,
      release: 'POST /release',
      reset: 'POST /reset before starting another run',
      shutdown: 'POST /shutdown',
    }),
  )
})
await listen(control)
const controlPort = (control.address() as AddressInfo).port
process.stdout.write(
  `${JSON.stringify({
    apiUrl: `http://127.0.0.1:${apiPort}`,
    controlUrl: `http://127.0.0.1:${controlPort}`,
    projectId: PROJECT_ID,
    root: fixture.root,
  })}\n`,
)

let shuttingDown = false
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  releaseRun()
  await Promise.allSettled([close(api), close(control)])
  await fixture.dispose()
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown()
  })
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.closeAllConnections()
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function listen(server: Server) {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError)
      resolve()
    })
  })
}
