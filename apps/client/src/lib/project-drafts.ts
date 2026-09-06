import type { LandingAgentSendInput } from '@workspace/prompt-panel'

export type ProjectDraft = Required<LandingAgentSendInput>
export const EMPTY_DRAFT: ProjectDraft = { attachments: [], prompt: '' }
const cache = new Map<string, ProjectDraft>()
let database: Promise<IDBDatabase> | undefined

export function cachedDraft(key: string): ProjectDraft | undefined {
  return cache.get(key)
}

export async function deleteDraft(key: string): Promise<void> {
  for (const cachedKey of cache.keys())
    if (cachedKey === key || cachedKey.startsWith(`${key}:turn:`))
      cache.delete(cachedKey)
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite')
    const store = transaction.objectStore('drafts')
    store.delete(key)
    const cursor = store.openCursor(
      IDBKeyRange.bound(`${key}:turn:`, `${key}:turn:\uffff`),
    )
    cursor.onsuccess = () => {
      const item = cursor.result
      if (item) {
        item.delete()
        item.continue()
      }
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function loadDraft(key: string): Promise<ProjectDraft> {
  const cached = cache.get(key)
  if (cached) return cached
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').get(key)
    request.onsuccess = () => {
      const draft =
        cache.get(key) ??
        (request.result as ProjectDraft | undefined) ??
        EMPTY_DRAFT
      cache.set(key, draft)
      resolve(draft)
    }
    request.onerror = () => reject(request.error)
  })
}

// Cache synchronously so navigation and an in-flight hydration cannot lose edits.
// IndexedDB stores image bytes without localStorage's small string quota.
export async function saveDraft(
  key: string,
  draft: ProjectDraft,
): Promise<void> {
  cache.set(key, draft)
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite')
    if (cache.has(key))
      transaction.objectStore('drafts').put(cache.get(key), key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('landing-drafts', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch((error: unknown) => {
    database = undefined
    throw error
  })
  return database
}
