import type {
  ProjectInput,
  ProjectRepository,
} from '../mastra/lib/project-store.ts'
import { ProjectFileCommitError } from '../mastra/lib/project-store.ts'
import type { RunCoordinator } from './run-coordinator.ts'

export interface ProjectMemoryDeletion {
  deleteProjectMemory(projectId: string): Promise<void>
}

export type ProjectService = ReturnType<typeof createProjectService>

export class ProjectCreationBlockedError extends Error {
  constructor(projectId: string) {
    super(`Project is being deleted or is already deleted: ${projectId}`)
    this.name = 'ProjectCreationBlockedError'
  }
}

export class ProjectDeletionBlockedError extends Error {
  constructor(projectId: string) {
    super(`Project deletion is blocked by unsettled run work: ${projectId}`)
    this.name = 'ProjectDeletionBlockedError'
  }
}

export class ProjectServiceDisposedError extends Error {
  constructor() {
    super('Project service is disposed.')
    this.name = 'ProjectServiceDisposedError'
  }
}

export class ProjectServiceUnsettledError extends Error {
  readonly projectIds: string[]

  constructor(projectIds: string[]) {
    super(`Project service work remains unsettled: ${projectIds.join(', ')}`)
    this.name = 'ProjectServiceUnsettledError'
    this.projectIds = projectIds
  }
}

export function createProjectService({
  coordinator,
  drainGraceMs = 5_000,
  memory,
  repository,
}: {
  coordinator: RunCoordinator
  drainGraceMs?: number
  memory: ProjectMemoryDeletion
  repository: ProjectRepository
}) {
  const deletions = new Map<string, Promise<void>>()
  const creations = new Map<string, Promise<unknown>>()
  let accepting = true

  function create(input: ProjectInput = {}) {
    if (!accepting) return Promise.reject(new ProjectServiceDisposedError())
    const key = input.creationKey
    if (key && coordinator.isProjectUnavailable(key)) {
      return Promise.reject(new ProjectCreationBlockedError(key))
    }
    const operation = repository.createProject(input)
    if (!key) return operation
    creations.set(key, operation)
    void operation.then(
      () => creations.delete(key),
      () => creations.delete(key),
    )
    return operation
  }

  function deleteProject(projectId: string): Promise<void> {
    if (!accepting) return Promise.reject(new ProjectServiceDisposedError())
    const current = deletions.get(projectId)
    if (current) return current
    const gate = coordinator.beginDeletion(projectId)
    repository.beginProjectDeletion(projectId)
    const operation = performDelete(projectId, gate)
    deletions.set(projectId, operation)
    void operation.then(
      () => deletions.delete(projectId),
      () => deletions.delete(projectId),
    )
    return operation
  }

  async function performDelete(
    projectId: string,
    gate: ReturnType<RunCoordinator['beginDeletion']>,
  ): Promise<void> {
    const creation = creations.get(projectId)
    if (creation) await Promise.allSettled([creation])
    try {
      await repository.writeProjectTombstone(projectId, 'deleting')
    } catch (error) {
      if (
        !(error instanceof ProjectFileCommitError) ||
        error.commitState === 'notCommitted'
      ) {
        repository.cancelProjectDeletion(projectId)
        gate.release()
      }
      throw error
    }

    if (gate.blocked) throw new ProjectDeletionBlockedError(projectId)
    const stopped = await coordinator.stop(projectId)
    if (stopped.outcome === 'blocked') {
      throw new ProjectDeletionBlockedError(projectId)
    }
    await repository.flushProjectMutations(projectId)
    repository.completeProjectDeletion(projectId)
    await memory.deleteProjectMemory(projectId)
    await repository.deleteProject(projectId)
    await repository.writeProjectTombstone(projectId, 'completed')
    coordinator.completeDeletion(projectId, gate.active)
    coordinator.markProjectDeleted(projectId)
  }

  async function recover(): Promise<number> {
    if (!accepting) throw new ProjectServiceDisposedError()
    let recovered = 0
    for (const tombstone of await repository.listProjectTombstones()) {
      if (tombstone.state === 'completed') {
        repository.completeProjectDeletion(tombstone.projectId)
        coordinator.markProjectDeleted(tombstone.projectId)
        continue
      }
      await deleteProject(tombstone.projectId)
      recovered += 1
    }
    return recovered
  }

  function close(): void {
    accepting = false
  }

  async function dispose(): Promise<void> {
    close()
    const work = [
      ...[...creations.entries()].map(([projectId, promise]) => ({
        projectId,
        promise,
      })),
      ...[...deletions.entries()].map(([projectId, promise]) => ({
        projectId,
        promise,
      })),
    ]
    if (work.length === 0) return
    const settled = await firstWithin(
      Promise.allSettled(work.map(({ promise }) => promise)),
      drainGraceMs,
    )
    if (!settled) {
      throw new ProjectServiceUnsettledError([
        ...new Set(work.map(({ projectId }) => projectId)),
      ])
    }
  }

  return { close, create, delete: deleteProject, dispose, recover }
}

async function firstWithin<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
