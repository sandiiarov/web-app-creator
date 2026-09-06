import { useCallback, useEffect, useRef, useState } from 'react'

import {
  cachedDraft,
  EMPTY_DRAFT,
  loadDraft,
  saveDraft,
  type ProjectDraft,
} from '../lib/project-drafts'

export function useProjectDraft(projectId: string) {
  const [draft, setDraft] = useState(
    () => cachedDraft(projectId) ?? EMPTY_DRAFT,
  )
  const [ready, setReady] = useState(!!cachedDraft(projectId))
  const [error, setError] = useState<null | string>(null)
  const current = useRef(draft)
  useEffect(() => {
    let active = true
    void loadDraft(projectId)
      .then((value) => {
        if (!active) return
        current.current = value
        setDraft(value)
      })
      .catch(() => {
        if (active)
          setError(
            'Draft storage is unavailable. Keep this tab open to preserve attachments.',
          )
      })
      .finally(() => {
        if (active) setReady(true)
      })
    return () => {
      active = false
    }
  }, [projectId])
  const update = useCallback(
    (value: ((previous: ProjectDraft) => ProjectDraft) | ProjectDraft) => {
      const next =
        typeof value === 'function'
          ? value(cachedDraft(projectId) ?? current.current)
          : value
      current.current = next
      setDraft(next)
      void saveDraft(projectId, next)
        .then(() => setError(null))
        .catch(() =>
          setError(
            'Could not save this draft on this device. Keep this tab open and try again.',
          ),
        )
    },
    [projectId],
  )
  return { draft, error, ready, update }
}
