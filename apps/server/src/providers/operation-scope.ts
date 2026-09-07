export const DEFAULT_OPERATION_TIMEOUT_MS = 120_000
export const DEFAULT_DRAIN_GRACE_MS = 5_000

export type DrainResult =
  | { ok: false; pendingOperationIds: string[]; reason: 'drain_failed' }
  | { ok: true }

export interface OperationContext {
  assertActive(): void
  createWriteLease(): OperationWriteLease
  readonly deadline: number
  drainChildren(promises: readonly Promise<unknown>[]): Promise<DrainResult>
  readonly id: string
  reportUsage(report: ProviderUsageInput): boolean
  runChild<T>(
    label: string,
    task: (operation: OperationContext) => Promise<T>,
  ): Promise<T>
  readonly signal: AbortSignal
}

export interface OperationScope {
  cancel(reason?: unknown): void
  close(): void
  drain(): Promise<DrainResult>
  getUsageReports(): readonly ProviderUsageReport[]
  run<T>(
    label: string,
    task: (operation: OperationContext) => Promise<T>,
  ): Promise<T>
  readonly signal: AbortSignal
  readonly state: OperationScopeState
  waitForSettled(): Promise<void>
}

export type OperationScopeFactory = (
  options?: Parameters<typeof createOperationScope>[0],
) => OperationScope

export type OperationScopeState = 'closed' | 'closing' | 'failed' | 'open'

export interface OperationWriteLease {
  assertWriteAllowed(): void
  readonly operationId: string
}

export type ProviderUsageInput = Omit<ProviderUsageReport, 'operationId'>

export interface ProviderUsageReport {
  amount: number
  category: 'firecrawl' | 'image' | 'vision'
  count?: number
  operationId: string
  reportId: string
  source: 'attachment' | 'generation' | 'scrape' | 'screenshot'
  unit: 'credits' | 'usd'
  usage?: unknown
}

type InternalOperation = OperationContext

export class OperationDeadlineError extends Error {
  constructor(operationId: string) {
    super(`Provider operation deadline exceeded: ${operationId}`)
    this.name = 'OperationDeadlineError'
  }
}

export class OperationDrainError extends Error {
  readonly result: Extract<DrainResult, { ok: false }>

  constructor(result: Extract<DrainResult, { ok: false }>) {
    super(
      `Provider operations did not settle before the drain grace period: ${result.pendingOperationIds.join(', ')}`,
    )
    this.name = 'OperationDrainError'
    this.result = result
  }
}

export class OperationScopeClosedError extends Error {
  constructor(message = 'Provider operation scope is closed.') {
    super(message)
    this.name = 'OperationScopeClosedError'
  }
}

export class OperationWriteLeaseError extends Error {
  constructor(operationId: string) {
    super(`Provider operation write lease is no longer valid: ${operationId}`)
    this.name = 'OperationWriteLeaseError'
  }
}

export function createOperationScope({
  drainGraceMs = DEFAULT_DRAIN_GRACE_MS,
  onUsage,
  operationTimeoutMs = DEFAULT_OPERATION_TIMEOUT_MS,
  signal: externalSignal,
}: {
  drainGraceMs?: number
  onUsage?: (report: ProviderUsageReport) => void
  operationTimeoutMs?: number
  signal?: AbortSignal
} = {}): OperationScope {
  if (!Number.isFinite(operationTimeoutMs) || operationTimeoutMs <= 0) {
    throw new Error('operationTimeoutMs must be a positive finite number.')
  }
  if (!Number.isFinite(drainGraceMs) || drainGraceMs < 0) {
    throw new Error('drainGraceMs must be a non-negative finite number.')
  }

  const controller = new AbortController()
  const operations = new Map<string, Promise<unknown>>()
  const operationIds = new WeakMap<Promise<unknown>, string>()
  const operationControls = new Map<
    string,
    { abort(reason: unknown): void; clearDeadline(): void }
  >()
  const reportIds = new Set<string>()
  const usageReports: ProviderUsageReport[] = []
  let nextOperation = 0
  let state: OperationScopeState = 'open'
  let writeLeasesRevoked = false
  let drainPromise: Promise<DrainResult> | undefined
  let failedDrainResult: Extract<DrainResult, { ok: false }> | undefined

  const onExternalAbort = () => cancel(externalSignal?.reason)
  if (externalSignal?.aborted) {
    cancel(externalSignal.reason)
  } else {
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true })
  }

  function cancel(reason?: unknown): void {
    if (state === 'closed' || state === 'failed') return
    state = 'closing'
    if (!controller.signal.aborted) {
      controller.abort(reason ?? new DOMException('Cancelled', 'AbortError'))
    }
  }

  function close(): void {
    if (state === 'open') state = 'closing'
  }

  function assertRegistrationAllowed(parent?: InternalOperation): void {
    if (state !== 'open') throw new OperationScopeClosedError()
    controller.signal.throwIfAborted()
    if (parent) {
      parent.assertActive()
      if (Date.now() >= parent.deadline) {
        throw new OperationDeadlineError(parent.id)
      }
    }
  }

  function register<T>(
    label: string,
    task: (operation: OperationContext) => Promise<T>,
    parent?: InternalOperation,
  ): Promise<T> {
    assertRegistrationAllowed(parent)
    nextOperation += 1
    const id = `${label}:${nextOperation}`
    const deadline = parent ? parent.deadline : Date.now() + operationTimeoutMs
    const operationController = new AbortController()
    const linkedSignal = AbortSignal.any([
      controller.signal,
      operationController.signal,
    ])
    let active = true
    let resolveTracked!: (value: PromiseLike<T> | T) => void
    let rejectTracked!: (reason?: unknown) => void
    const tracked = new Promise<T>((resolve, reject) => {
      resolveTracked = resolve
      rejectTracked = reject
    })
    void tracked.catch(() => {})

    const internal: InternalOperation = {
      assertActive() {
        if (!active) throw new OperationScopeClosedError()
        if (Date.now() >= deadline && !operationController.signal.aborted) {
          operationController.abort(new OperationDeadlineError(id))
        }
        linkedSignal.throwIfAborted()
        if (writeLeasesRevoked || state === 'failed') {
          throw new OperationScopeClosedError()
        }
      },
      createWriteLease() {
        return {
          assertWriteAllowed() {
            try {
              internal.assertActive()
            } catch {
              throw new OperationWriteLeaseError(id)
            }
          },
          operationId: id,
        }
      },
      deadline,
      drainChildren(promises) {
        return drainRegisteredChildren(promises)
      },
      id,
      reportUsage(report) {
        if (!active) return false
        if (!Number.isFinite(report.amount) || report.amount < 0) {
          throw new Error(
            'Provider usage amount must be finite and non-negative.',
          )
        }
        const reportKey = `${id}\0${report.reportId}`
        if (reportIds.has(reportKey)) return false
        reportIds.add(reportKey)
        const recorded = { ...report, operationId: id }
        usageReports.push(recorded)
        onUsage?.(recorded)
        return true
      },
      runChild(childLabel, childTask) {
        return register(childLabel, childTask, internal)
      },
      signal: linkedSignal,
    }

    operations.set(id, tracked)
    operationIds.set(tracked, id)
    const remainingMs = Math.max(0, deadline - Date.now())
    const deadlineTimer = setTimeout(() => {
      operationController.abort(new OperationDeadlineError(id))
    }, remainingMs)
    operationControls.set(id, {
      abort(reason) {
        if (!operationController.signal.aborted) {
          operationController.abort(reason)
        }
      },
      clearDeadline() {
        clearTimeout(deadlineTimer)
      },
    })

    let work: Promise<T>
    try {
      work = Promise.resolve(task(internal))
    } catch (error) {
      work = Promise.reject(error)
    }
    void work.then(resolveTracked, rejectTracked)
    void tracked.then(settled, settled)
    return tracked

    function settled(): void {
      clearTimeout(deadlineTimer)
      active = false
      operations.delete(id)
      operationControls.delete(id)
    }
  }

  async function drain(): Promise<DrainResult> {
    if (failedDrainResult) return failedDrainResult
    drainPromise ??= drainOnce()
    return drainPromise
  }

  async function drainOnce(): Promise<DrainResult> {
    close()
    const pending = [...operations.values()]
    if (pending.length === 0) {
      state = 'closed'
      writeLeasesRevoked = true
      cleanup()
      return { ok: true }
    }

    let graceTimer: ReturnType<typeof setTimeout> | undefined
    const graceExpired = new Promise<'expired'>((resolve) => {
      graceTimer = setTimeout(() => resolve('expired'), drainGraceMs)
    })
    const settled = Promise.allSettled(pending).then(() => 'settled' as const)
    const outcome = await Promise.race([settled, graceExpired])
    if (graceTimer) clearTimeout(graceTimer)
    if (outcome === 'expired') {
      const pendingOperationIds = [...operations.keys()]
      const result = {
        ok: false,
        pendingOperationIds,
        reason: 'drain_failed',
      } as const
      failScope(result)
      return result
    }

    state = 'closed'
    writeLeasesRevoked = true
    cleanup()
    return { ok: true }
  }

  async function drainRegisteredChildren(
    promises: readonly Promise<unknown>[],
  ): Promise<DrainResult> {
    if (failedDrainResult) return failedDrainResult
    for (const promise of promises) {
      if (!operationIds.has(promise)) {
        throw new Error(
          'Operation child drain accepts only promises registered by this scope.',
        )
      }
    }
    const pending = promises.filter((promise) => {
      const id = operationIds.get(promise)
      return id !== undefined && operations.get(id) === promise
    })
    if (pending.length === 0) return { ok: true }
    let graceTimer: ReturnType<typeof setTimeout> | undefined
    const outcome = await Promise.race([
      Promise.allSettled(pending).then(() => 'settled' as const),
      new Promise<'expired'>((resolve) => {
        graceTimer = setTimeout(() => resolve('expired'), drainGraceMs)
      }),
    ])
    if (graceTimer) clearTimeout(graceTimer)
    if (outcome === 'settled') return { ok: true }
    const result = {
      ok: false,
      pendingOperationIds: pending.flatMap((promise) => {
        const id = operationIds.get(promise)
        return id ? [id] : []
      }),
      reason: 'drain_failed',
    } as const
    failScope(result)
    return result
  }

  function failScope(result: Extract<DrainResult, { ok: false }>): void {
    failedDrainResult = result
    state = 'failed'
    writeLeasesRevoked = true
    const reason = new OperationDrainError(result)
    if (!controller.signal.aborted) controller.abort(reason)
    for (const control of operationControls.values()) {
      control.clearDeadline()
      control.abort(reason)
    }
    cleanup()
  }

  function cleanup(): void {
    externalSignal?.removeEventListener('abort', onExternalAbort)
  }

  return {
    cancel,
    close,
    drain,
    getUsageReports() {
      return structuredClone(usageReports)
    },
    run(label, task) {
      return register(label, task)
    },
    signal: controller.signal,
    get state() {
      return state
    },
    async waitForSettled() {
      while (operations.size > 0) {
        await Promise.allSettled(operations.values())
      }
    },
  }
}

/** Run one provider-owned operation, creating and draining a local scope when
 * no run scope is available (for example a Mastra Studio tool invocation). */
export async function runProviderOperation<T>(
  scope: OperationScope | undefined,
  label: string,
  task: (operation: OperationContext) => Promise<T>,
  options: Parameters<typeof createOperationScope>[0] = {},
): Promise<T> {
  const ownedScope = scope ?? createOperationScope(options)
  let operationSignal!: AbortSignal
  const actual = ownedScope.run(label, (operation) => {
    operationSignal = operation.signal
    return task(operation)
  })
  let value: T
  let failed = false
  let failure: unknown
  try {
    value = await awaitOperation(actual, operationSignal)
  } catch (error) {
    failed = true
    failure = error
    if (operationSignal.aborted) ownedScope.cancel(error)
  }
  if (scope) {
    if (failed) throw failure
    return value!
  }
  const drained = await ownedScope.drain()
  if (!drained.ok) throw new OperationDrainError(drained)
  if (failed) throw failure
  return value!
}

export async function runStandaloneProviderOperation<T>(
  createScope: OperationScopeFactory,
  label: string,
  task: (operation: OperationContext) => Promise<T>,
  options: Parameters<typeof createOperationScope>[0] = {},
): Promise<T> {
  const scope = createScope(options)
  let value: T
  let failed = false
  let failure: unknown
  try {
    value = await runProviderOperation(scope, label, task)
  } catch (error) {
    failed = true
    failure = error
  }
  const drained = await scope.drain()
  if (!drained.ok) throw new OperationDrainError(drained)
  if (failed) throw failure
  return value!
}

async function awaitOperation<T>(
  actual: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw signal.reason
  let onAbort!: () => void
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([actual, aborted])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}
