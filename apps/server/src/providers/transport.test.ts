import { describe, expect, it, vi } from 'vitest'

import { createOperationScope } from './operation-scope.ts'
import {
  createProviderTransport,
  PROVIDER_ERROR_MAX_BYTES,
  ProviderTransportError,
} from './transport.ts'

describe('provider transport', () => {
  it('keeps the deadline active through a stalled response body', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
      },
      start() {},
    })
    const transport = createProviderTransport({
      fetch: vi.fn<typeof globalThis.fetch>(async () => new Response(body)),
    })
    const scope = createOperationScope({ operationTimeoutMs: 10 })

    const result = await scope.run('stalled', (operation) =>
      transport.text({
        label: 'Stalled body',
        operation,
        retry: 'safe',
        url: 'https://provider.test/stalled',
      }),
    )

    expect(result).toMatchObject({
      error: { code: 'timed_out' },
      ok: false,
    })
    expect(cancelled).toBe(true)
  })

  it('rejects an incrementally oversized body without Content-Length', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
      },
      pull(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.enqueue(new Uint8Array([4, 5, 6]))
      },
    })
    const transport = createProviderTransport({
      fetch: vi.fn<typeof globalThis.fetch>(async () => new Response(body)),
    })
    const scope = createOperationScope()

    const result = await scope.run('large', (operation) =>
      transport.bytes({
        label: 'Large body',
        maxBytes: 4,
        operation,
        retry: 'safe',
        url: 'https://provider.test/large',
      }),
    )

    expect(result).toMatchObject({ error: { code: 'too_large' }, ok: false })
    expect(cancelled).toBe(true)
  })

  it('cancels an abortable safe-read retry delay', async () => {
    const firstResponse = deferred<void>()
    const external = new AbortController()
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      firstResponse.resolve()
      return new Response('temporary', { status: 503 })
    })
    const transport = createProviderTransport({ fetch })
    const scope = createOperationScope({ signal: external.signal })
    const request = scope.run('catalog', (operation) =>
      transport.json({
        baseDelayMs: 10_000,
        label: 'Catalog',
        operation,
        retry: 'safe',
        url: 'https://provider.test/catalog',
      }),
    )
    await firstResponse.promise
    external.abort()

    await expect(request).resolves.toMatchObject({
      error: { code: 'cancelled' },
      ok: false,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('fully releases a retry response reader before the next safe attempt', async () => {
    let released = 0
    const retryResponse = {
      body: {
        getReader() {
          let read = false
          return {
            async cancel() {},
            async read() {
              if (read) return { done: true, value: undefined }
              read = true
              return {
                done: false,
                value: new TextEncoder().encode('temporary'),
              }
            },
            releaseLock() {
              released += 1
            },
          }
        },
      },
      headers: new Headers(),
      ok: false,
      status: 503,
    } as Response
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(retryResponse)
      .mockResolvedValueOnce(Response.json({ value: 1 }))
    const transport = createProviderTransport({ fetch })
    const scope = createOperationScope()

    const result = await scope.run('catalog', (operation) =>
      transport.json<{ value: number }>({
        baseDelayMs: 0,
        label: 'Catalog',
        operation,
        retry: 'safe',
        url: 'https://provider.test/catalog',
      }),
    )

    expect(result).toMatchObject({ ok: true, value: { value: 1 } })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(released).toBe(1)
  })

  it('does not retry an ambiguous paid request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error('connection reset')
    })
    const transport = createProviderTransport({ fetch })
    const scope = createOperationScope()

    const result = await scope.run('paid', (operation) =>
      transport.json({
        label: 'Paid generation',
        maxAttempts: 4,
        operation,
        retry: 'paid',
        url: 'https://provider.test/generate',
      }),
    )

    expect(result).toMatchObject({
      error: {
        code: 'ambiguous_paid_outcome',
        remoteOutcome: 'unknown',
      },
      ok: false,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('classifies invalid JSON bodies', async () => {
    const transport = createProviderTransport({
      fetch: vi.fn<typeof globalThis.fetch>(
        async () => new Response('{invalid'),
      ),
    })
    const scope = createOperationScope()

    const result = await scope.run('json', (operation) =>
      transport.json({
        label: 'JSON response',
        operation,
        retry: 'safe',
        url: 'https://provider.test/json',
      }),
    )

    expect(result).toMatchObject({
      error: { code: 'invalid_body' },
      ok: false,
    })
  })

  it('keeps an abort-ignoring body owned until drain reports failure', async () => {
    const bodyRead = deferred<
      { done: false; value: Uint8Array } | { done: true; value?: undefined }
    >()
    const readEntered = deferred<void>()
    const reader = {
      async cancel() {},
      read() {
        readEntered.resolve()
        return bodyRead.promise
      },
      releaseLock() {},
    }
    const response = {
      body: { getReader: () => reader },
      headers: new Headers(),
      ok: true,
      status: 200,
    } as Response
    const transport = createProviderTransport({
      fetch: vi.fn<typeof globalThis.fetch>(async () => response),
    })
    const scope = createOperationScope({ drainGraceMs: 5 })
    const request = scope.run('ignores-abort', (operation) =>
      transport.text({
        label: 'Ignoring body',
        operation,
        retry: 'safe',
        url: 'https://provider.test/ignores-abort',
      }),
    )
    await readEntered.promise
    scope.cancel()

    await expect(scope.drain()).resolves.toEqual({
      ok: false,
      pendingOperationIds: ['ignores-abort:1'],
      reason: 'drain_failed',
    })
    bodyRead.resolve({ done: true, value: undefined })
    await expect(request).resolves.toMatchObject({
      error: { code: 'cancelled' },
      ok: false,
    })
  })

  it('rejects a bodyless response that arrives after cancellation', async () => {
    const response = deferred<Response>()
    const transport = createProviderTransport({
      fetch: vi.fn<typeof globalThis.fetch>(() => response.promise),
    })
    const scope = createOperationScope()
    const request = scope.run('late-headers', (operation) =>
      transport.bytes({
        label: 'Late headers',
        operation,
        retry: 'safe',
        url: 'https://provider.test/late-headers',
      }),
    )

    scope.cancel()
    response.resolve(new Response(null, { status: 204 }))

    await expect(request).resolves.toMatchObject({
      error: { code: 'cancelled' },
      ok: false,
    })
    await expect(scope.drain()).resolves.toEqual({ ok: true })
  })

  it('owns cancellation of a late response body after cancellation', async () => {
    const response = deferred<Response>()
    const cancelFinished = deferred<void>()
    const cancellationEntered = deferred<void>()
    const body = new ReadableStream<Uint8Array>({
      async cancel() {
        cancellationEntered.resolve()
        await cancelFinished.promise
      },
    })
    const transport = createProviderTransport({
      fetch: vi.fn<typeof globalThis.fetch>(() => response.promise),
    })
    const scope = createOperationScope({ drainGraceMs: 5 })
    const request = scope.run('late-body', (operation) =>
      transport.bytes({
        label: 'Late body',
        operation,
        retry: 'safe',
        url: 'https://provider.test/late-body',
      }),
    )

    scope.cancel()
    response.resolve(new Response(body))
    await cancellationEntered.promise

    await expect(scope.drain()).resolves.toEqual({
      ok: false,
      pendingOperationIds: ['late-body:1'],
      reason: 'drain_failed',
    })
    cancelFinished.resolve()
    await expect(request).resolves.toMatchObject({
      error: { code: 'cancelled' },
      ok: false,
    })
  })

  it('keeps asynchronous reader cancellation owned by the scope', async () => {
    const cancelFinished = deferred<void>()
    const readEntered = deferred<void>()
    const reader = {
      cancel: vi.fn<() => Promise<void>>(() => cancelFinished.promise),
      async read() {
        readEntered.resolve()
        return { done: true as const, value: undefined }
      },
      releaseLock() {},
    }
    const response = {
      body: { getReader: () => reader },
      headers: new Headers(),
      ok: true,
      status: 200,
    } as unknown as Response
    const transport = createProviderTransport({
      fetch: vi.fn<typeof globalThis.fetch>(async () => response),
    })
    const scope = createOperationScope({ drainGraceMs: 5 })
    const request = scope.run('cancel-cleanup', (operation) =>
      transport.text({
        label: 'Cancel cleanup',
        operation,
        retry: 'safe',
        url: 'https://provider.test/cancel-cleanup',
      }),
    )
    await readEntered.promise
    scope.cancel()

    await expect(scope.drain()).resolves.toEqual({
      ok: false,
      pendingOperationIds: ['cancel-cleanup:1'],
      reason: 'drain_failed',
    })
    cancelFinished.resolve()
    await expect(request).resolves.toMatchObject({
      error: { code: 'cancelled' },
      ok: false,
    })
  })

  it('uses the linked caller signal for body cancellation and classification', async () => {
    const caller = new AbortController()
    const readEntered = deferred<void>()
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
      },
      pull() {
        readEntered.resolve()
      },
    })
    const transport = createProviderTransport({
      fetch: vi.fn<typeof globalThis.fetch>(async () => new Response(body)),
    })
    const scope = createOperationScope()
    const request = scope.run('linked', (operation) =>
      transport.text({
        init: { signal: caller.signal },
        label: 'Linked signal',
        operation,
        retry: 'safe',
        url: 'https://provider.test/linked',
      }),
    )
    await readEntered.promise
    caller.abort()

    await expect(request).resolves.toMatchObject({
      error: { code: 'cancelled' },
      ok: false,
    })
    expect(cancelled).toBe(true)
  })

  it.each([
    ['HTTP failure', new Response('failed', { status: 500 }), 'http'],
    ['invalid JSON', new Response('{invalid'), 'invalid_body'],
    [
      'oversized body',
      new Response('1234', { headers: { 'content-length': '4' } }),
      'too_large',
    ],
    [
      'oversized HTTP error body',
      new Response('x', {
        headers: {
          'content-length': String(PROVIDER_ERROR_MAX_BYTES + 1),
        },
        status: 500,
      }),
      'too_large',
    ],
  ])(
    'keeps a paid %s outcome unknown',
    async (_case, response, expectedCode) => {
      const transport = createProviderTransport({
        fetch: vi.fn<typeof globalThis.fetch>(async () => response),
      })
      const scope = createOperationScope()

      const result = await scope.run('paid', (operation) =>
        transport.json({
          label: 'Paid response',
          maxBytes: expectedCode === 'too_large' ? 3 : undefined,
          operation,
          retry: 'paid',
          url: 'https://provider.test/paid',
        }),
      )

      expect(result).toMatchObject({
        error: { code: expectedCode, remoteOutcome: 'unknown' },
        ok: false,
      })
    },
  )

  it('exposes typed transport failures', () => {
    expect(
      new ProviderTransportError({
        code: 'http',
        message: 'failed',
        status: 500,
      }),
    ).toMatchObject({ code: 'http', status: 500 })
  })
})

function deferred<T>() {
  let reject!: (error: unknown) => void
  let resolve!: (value: PromiseLike<T> | T) => void
  const promise = new Promise<T>((accept, deny) => {
    resolve = accept
    reject = deny
  })
  return { promise, reject, resolve }
}
