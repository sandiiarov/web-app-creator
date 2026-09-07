import { describe, expect, it, vi } from 'vitest'

import {
  createOperationScope,
  OperationScopeClosedError,
  OperationWriteLeaseError,
  runProviderOperation,
} from './operation-scope.ts'

describe('provider operation scope', () => {
  it('allows registered parent work to add a child before close', async () => {
    const scope = createOperationScope({ drainGraceMs: 50 })

    await expect(
      scope.run('parent', (operation) =>
        operation.runChild('child', async (child) => {
          expect(child.deadline).toBe(operation.deadline)
          return 'settled'
        }),
      ),
    ).resolves.toBe('settled')
    await expect(scope.drain()).resolves.toEqual({ ok: true })
  })

  it('rejects child registration after draining closes admission', async () => {
    const scope = createOperationScope({ drainGraceMs: 50 })
    const entered = deferred<void>()
    const release = deferred<void>()
    const parent = scope.run('parent', async (operation) => {
      entered.resolve()
      await release.promise
      return operation.runChild('too-late', async () => 'unreachable')
    })
    await entered.promise

    const draining = scope.drain()
    release.resolve()
    await expect(parent).rejects.toBeInstanceOf(OperationScopeClosedError)
    await expect(draining).resolves.toEqual({ ok: true })
    expect(scope.state).toBe('closed')
  })

  it('returns drain_failed within the grace period for abort-ignoring work', async () => {
    const scope = createOperationScope({ drainGraceMs: 5 })
    const never = new Promise<void>(() => {})
    void scope.run('stuck', async () => never)

    await expect(scope.drain()).resolves.toEqual({
      ok: false,
      pendingOperationIds: ['stuck:1'],
      reason: 'drain_failed',
    })
    expect(scope.state).toBe('failed')
    expect(scope.signal.aborted).toBe(true)
  })

  it('revokes late write leases while retaining deduplicated known usage', async () => {
    const release = deferred<void>()
    const usage = vi.fn<(report: unknown) => void>()
    const reportingScope = createOperationScope({
      drainGraceMs: 5,
      onUsage: usage,
    })
    let mutationAttempted = false
    const operation = reportingScope.run('paid', async (context) => {
      const lease = context.createWriteLease()
      const report = {
        amount: 1.25,
        category: 'firecrawl' as const,
        reportId: 'attempt-1',
        source: 'screenshot' as const,
        unit: 'credits' as const,
      }
      expect(context.reportUsage(report)).toBe(true)
      expect(context.reportUsage(report)).toBe(false)
      await release.promise
      mutationAttempted = true
      lease.assertWriteAllowed()
    })

    reportingScope.cancel()
    await expect(reportingScope.drain()).resolves.toMatchObject({
      ok: false,
      pendingOperationIds: ['paid:1'],
    })
    expect(reportingScope.getUsageReports()).toEqual([
      expect.objectContaining({
        amount: 1.25,
        operationId: 'paid:1',
        reportId: 'attempt-1',
      }),
    ])
    expect(usage).toHaveBeenCalledTimes(1)

    release.resolve()
    await expect(operation).rejects.toBeInstanceOf(OperationWriteLeaseError)
    expect(mutationAttempted).toBe(true)
  })

  it('deduplicates reports within one operation while retaining the same local id from another operation', async () => {
    const scope = createOperationScope()
    const report = {
      amount: 2,
      category: 'image' as const,
      reportId: 'response',
      source: 'generation' as const,
      unit: 'usd' as const,
    }

    await scope.run('first', async (operation) => {
      expect(operation.reportUsage(report)).toBe(true)
      expect(operation.reportUsage(report)).toBe(false)
    })
    await scope.run('second', async (operation) => {
      expect(operation.reportUsage(report)).toBe(true)
    })

    expect(scope.getUsageReports()).toHaveLength(2)
    await expect(scope.drain()).resolves.toEqual({ ok: true })
  })

  it('bounds failed child cleanup and fails the owning scope', async () => {
    const scope = createOperationScope({ drainGraceMs: 5 })
    const result = await scope.run('parent', async (operation) => {
      const stuck = operation.runChild(
        'stuck-child',
        () => new Promise<never>(() => {}),
      )
      return operation.drainChildren([stuck])
    })

    expect(result).toEqual({
      ok: false,
      pendingOperationIds: ['stuck-child:2'],
      reason: 'drain_failed',
    })
    expect(scope.signal.reason).toMatchObject({ name: 'OperationDrainError' })
    await expect(scope.drain()).resolves.toEqual(result)
  })

  it('waits for registered child settlements without closing the scope', async () => {
    const scope = createOperationScope({ drainGraceMs: 50 })
    await scope.run('parent', async (operation) => {
      const child = operation.runChild('child', async () => {
        throw new Error('child failed')
      })
      await expect(operation.drainChildren([child])).resolves.toEqual({
        ok: true,
      })
      expect(scope.state).toBe('open')
    })
    await expect(scope.run('next', async () => 'accepted')).resolves.toBe(
      'accepted',
    )
  })

  it('rejects promises that are not registered children of the scope', async () => {
    const scope = createOperationScope()

    await expect(
      scope.run('parent', (operation) =>
        operation.drainChildren([Promise.resolve('foreign')]),
      ),
    ).rejects.toThrow('only promises registered by this scope')
  })

  it('preserves a task rejection whose reason is undefined', async () => {
    await expect(
      runProviderOperation(undefined, 'undefined-rejection', () =>
        Promise.reject(undefined),
      ),
    ).rejects.toBeUndefined()
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
