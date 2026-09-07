import http from 'node:http'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import net, { Socket } from 'node:net'
import tls from 'node:tls'

const originalFetch = globalThis.fetch
const originalHttpGet = http.get
const originalHttpRequest = http.request
const originalHttpsGet = https.get
const originalHttpsRequest = https.request
const originalNetConnect = net.connect
const originalNetCreateConnection = net.createConnection
const originalSocketConnect = Socket.prototype.connect
const originalTlsConnect = tls.connect
const allowedOrigins = new Set<string>()
const allowedSockets = new Set<string>()
let firecrawlSmokeLeases = 0

/** Allow external traffic only while the explicitly opted-in smoke test runs. */
export function allowFirecrawlSmokeNetwork(): () => void {
  if (process.env.RUN_FIRECRAWL_SMOKE !== '1') {
    throw new Error('Firecrawl smoke network requires RUN_FIRECRAWL_SMOKE=1')
  }
  firecrawlSmokeLeases += 1
  return () => {
    firecrawlSmokeLeases = Math.max(0, firecrawlSmokeLeases - 1)
  }
}

/** Permit one explicitly started loopback fixture until the returned cleanup runs. */
export function allowNetworkOrigin(value: string): () => void {
  const url = new URL(value)
  const hostname = normalizeHostname(url.hostname)
  if (
    hostname !== '127.0.0.1' &&
    hostname !== 'localhost' &&
    hostname !== '::1'
  ) {
    throw new Error(
      `Only loopback fixture origins can be registered: ${url.origin}`,
    )
  }
  const port = url.port || (url.protocol === 'https:' ? '443' : '80')
  allowedOrigins.add(url.origin)
  allowedSockets.add(`${hostname}:${port}`)
  return () => {
    allowedOrigins.delete(url.origin)
    allowedSockets.delete(`${hostname}:${port}`)
  }
}

function assertSocketAllowed(args: unknown[]): void {
  if (externalSmokeEnabled()) return
  const target = socketTarget(args)
  if (target === 'unix-socket') return
  if (!allowedSockets.has(target)) {
    throw new Error(`Unexpected TCP connection to ${target}`)
  }
}

function assertUrlAllowed(value: string | URL): void {
  if (externalSmokeEnabled()) return
  const url = value instanceof URL ? value : new URL(value)
  if (!allowedOrigins.has(url.origin)) {
    throw new Error(`Unexpected network request to ${url.origin}`)
  }
}

function externalSmokeEnabled(): boolean {
  return firecrawlSmokeLeases > 0
}

function normalizeHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
}

function requestTarget(args: unknown[], protocol: 'http:' | 'https:'): URL {
  const first = args[0]
  if (typeof first === 'string' || first instanceof URL) {
    return new URL(first)
  }
  const options = (first ?? {}) as {
    host?: string
    hostname?: string
    path?: string
    port?: number | string
    protocol?: string
  }
  const host = options.hostname ?? options.host ?? 'localhost'
  const port = options.port == null ? '' : `:${String(options.port)}`
  return new URL(
    `${options.protocol ?? protocol}//${host}${port}${options.path ?? '/'}`,
  )
}

function socketTarget(args: unknown[]): string {
  if (Array.isArray(args[0])) return socketTarget(args[0])
  const first = args[0]
  if (typeof first === 'number') {
    const host = normalizeHostname(
      typeof args[1] === 'string' ? args[1] : 'localhost',
    )
    return `${host}:${first}`
  }
  if (first && typeof first === 'object') {
    const options = first as {
      host?: string
      hostname?: string
      path?: string
      port?: number | string
    }
    if (options.path && options.port == null) return 'unix-socket'
    const host = normalizeHostname(
      options.hostname ?? options.host ?? 'localhost',
    )
    return `${host}:${String(options.port ?? '')}`
  }
  return 'unknown'
}

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  assertUrlAllowed(url)
  return originalFetch(input, init)
}

http.request = ((...args: unknown[]) => {
  assertUrlAllowed(requestTarget(args, 'http:'))
  return Reflect.apply(originalHttpRequest, http, args)
}) as typeof http.request
http.get = ((...args: unknown[]) => {
  assertUrlAllowed(requestTarget(args, 'http:'))
  return Reflect.apply(originalHttpGet, http, args)
}) as typeof http.get
https.request = ((...args: unknown[]) => {
  assertUrlAllowed(requestTarget(args, 'https:'))
  return Reflect.apply(originalHttpsRequest, https, args)
}) as typeof https.request
https.get = ((...args: unknown[]) => {
  assertUrlAllowed(requestTarget(args, 'https:'))
  return Reflect.apply(originalHttpsGet, https, args)
}) as typeof https.get
net.connect = ((...args: unknown[]) => {
  assertSocketAllowed(args)
  return Reflect.apply(originalNetConnect, net, args)
}) as typeof net.connect
net.createConnection = ((...args: unknown[]) => {
  assertSocketAllowed(args)
  return Reflect.apply(originalNetCreateConnection, net, args)
}) as typeof net.createConnection
Socket.prototype.connect = function (this: Socket, ...args: unknown[]) {
  assertSocketAllowed(args)
  return Reflect.apply(originalSocketConnect, this, args)
} as typeof Socket.prototype.connect
tls.connect = ((...args: unknown[]) => {
  assertSocketAllowed(args)
  return Reflect.apply(originalTlsConnect, tls, args)
}) as typeof tls.connect
syncBuiltinESMExports()
