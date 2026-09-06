import { useEffect, useSyncExternalStore } from 'react'

export const MOTION_PREFERENCES = [
  'none',
  'reduced',
  'standard',
  'enhanced',
] as const
export type MotionPreference = (typeof MOTION_PREFERENCES)[number]
const STORAGE_KEY = 'workspace.motion.v1'
const CHANGE_EVENT = 'workspace-motion-change'
let fallback: MotionPreference = 'standard'

export function useMotionPreference() {
  const preference = useSyncExternalStore(
    subscribe,
    readPreference,
    () => 'standard' as MotionPreference,
  )
  useEffect(() => {
    document.documentElement.dataset.motion = preference
  }, [preference])
  return [preference, setPreference] as const
}

function readPreference(): MotionPreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY) as MotionPreference
    return MOTION_PREFERENCES.includes(value) ? value : fallback
  } catch {
    return fallback
  }
}

function setPreference(value: MotionPreference) {
  fallback = value
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* Keep the preference for this session when storage is blocked. */
  }
  document.documentElement.dataset.motion = value
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}
