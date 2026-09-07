import { spawn } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('server startup', () => {
  it('runs the real main entrypoint with production resources confined to a temporary app', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'server-startup-test-'))
    const sourceRoot = resolve('src')
    const appRoot = join(fixtureRoot, 'app')
    const port = await reservePort()
    let child: ReturnType<typeof spawn> | undefined
    try {
      await cp(sourceRoot, join(appRoot, 'src'), { recursive: true })
      await writeFile(
        join(appRoot, 'package.json'),
        await readFile(resolve('package.json')),
      )
      await symlink(
        resolve('node_modules'),
        join(appRoot, 'node_modules'),
        'dir',
      )
      const guardPath = join(fixtureRoot, 'startup-guard.mjs')
      await writeFile(guardPath, startupGuardSource())

      child = spawn(
        process.execPath,
        [
          '--experimental-strip-types',
          '--import',
          guardPath,
          join(appRoot, 'src', 'index.ts'),
        ],
        {
          cwd: appRoot,
          env: {
            ...process.env,
            HOST: '127.0.0.1',
            OPENROUTER_API_KEY: 'fixture-key',
            PORT: String(port),
            RUN_FIRECRAWL_SMOKE: '0',
            STARTUP_FIXTURE_ROOT: fixtureRoot,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )

      const output = await waitForListening(child)
      expect(output).toContain(`Server listening at http://127.0.0.1:${port}`)
      expect(
        resolve(appRoot, '.data', 'projects').startsWith(fixtureRoot),
      ).toBe(true)
      expect(resolve(appRoot, 'mastra.db').startsWith(fixtureRoot)).toBe(true)
      expect(resolve(appRoot, 'mastra.duckdb').startsWith(fixtureRoot)).toBe(
        true,
      )
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM')
        await new Promise<void>((resolveExit) =>
          child!.once('exit', resolveExit),
        )
      }
      await rm(fixtureRoot, { force: true, recursive: true })
    }
  }, 20_000)
})

async function reservePort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('port reservation did not expose a TCP address')
  }
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error)
      else resolveClose()
    })
  })
  return address.port
}

function startupGuardSource(): string {
  return `
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import tls from 'node:tls'

const root = resolve(process.env.STARTUP_FIXTURE_ROOT)
const assertOwned = (value) => {
  if (typeof value === 'number') return
  const target = resolve(value instanceof URL ? value : String(value))
  const path = relative(root, target)
  if (path === '..' || path.startsWith('..' + sep) || isAbsolute(path)) {
    throw new Error('startup mutation escaped fixture root: ' + target)
  }
}
for (const name of ['appendFileSync', 'mkdirSync', 'rmSync', 'writeFileSync']) {
  const original = fs[name]
  fs[name] = (...args) => { assertOwned(args[0]); return Reflect.apply(original, fs, args) }
}
for (const name of ['appendFile', 'mkdir', 'rm', 'writeFile']) {
  const original = fsp[name]
  fsp[name] = (...args) => { assertOwned(args[0]); return Reflect.apply(original, fsp, args) }
}
const originalCreateWriteStream = fs.createWriteStream
fs.createWriteStream = (...args) => {
  assertOwned(args[0])
  return Reflect.apply(originalCreateWriteStream, fs, args)
}
globalThis.fetch = async () => { throw new Error('startup provider request denied') }
const denyRequest = () => { throw new Error('startup network request denied') }
http.request = denyRequest
http.get = denyRequest
https.request = denyRequest
https.get = denyRequest
net.connect = denyRequest
net.createConnection = denyRequest
net.Socket.prototype.connect = denyRequest
tls.connect = denyRequest
syncBuiltinESMExports()
`
}

async function waitForListening(
  child: ReturnType<typeof spawn>,
): Promise<string> {
  if (!child.stderr || !child.stdout) {
    throw new Error('startup child was created without output pipes')
  }
  const stderrStream = child.stderr
  const stdoutStream = child.stdout
  let stderr = ''
  let stdout = ''
  stderrStream.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8')
  })
  return new Promise<string>((resolveOutput, rejectOutput) => {
    const timeout = setTimeout(() => {
      rejectOutput(new Error(`server startup timed out: ${stderr}`))
    }, 15_000)
    child.once('error', (error) => {
      clearTimeout(timeout)
      rejectOutput(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      rejectOutput(
        new Error(
          `server exited before listening (${String(code)}/${String(signal)}): ${stderr}`,
        ),
      )
    })
    stdoutStream.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
      if (stdout.includes('Server listening at ')) {
        clearTimeout(timeout)
        resolveOutput(stdout)
      }
    })
  })
}
