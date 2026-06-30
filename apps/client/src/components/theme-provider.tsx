import * as React from 'react'

import { KEYBOARD_SHORTCUTS } from '#lib/keyboard-shortcuts'

type ResolvedTheme = 'dark' | 'light'
type Theme = 'dark' | 'light' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  disableTransitionOnChange?: boolean
  storageKey?: string
}

type ThemeProviderState = {
  setTheme: (theme: Theme) => void
  theme: Theme
}

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'
const THEME_VALUES = new Set<Theme>(['dark', 'light', 'system'])

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined)

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  disableTransitionOnChange = true,
  storageKey = 'theme',
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() =>
    getStoredTheme(storageKey, defaultTheme),
  )

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      localStorage.setItem(storageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [storageKey],
  )

  useApplyTheme(theme, disableTransitionOnChange)
  useThemeHotkey(setThemeState, storageKey)
  useThemeStorageSync(setThemeState, storageKey, defaultTheme)

  const value = React.useMemo(
    () => ({
      setTheme,
      theme,
    }),
    [theme, setTheme],
  )

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

function applyTheme(theme: Theme, disableTransitionOnChange: boolean) {
  const root = document.documentElement
  const restoreTransitions = disableTransitionOnChange
    ? disableTransitionsTemporarily()
    : null

  root.classList.remove('light', 'dark')
  root.classList.add(resolveTheme(theme))

  restoreTransitions?.()
}

function disableTransitionsTemporarily() {
  const style = document.createElement('style')
  style.appendChild(
    document.createTextNode(
      '*,*::before,*::after{-webkit-transition:none!important;transition:none!important}',
    ),
  )
  document.head.appendChild(style)

  return () => {
    window.getComputedStyle(document.body)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove()
      })
    })
  }
}

function getStoredTheme(storageKey: string, defaultTheme: Theme) {
  const storedTheme = localStorage.getItem(storageKey)

  return isTheme(storedTheme) ? storedTheme : defaultTheme
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? 'dark' : 'light'
}

function getToggledTheme(theme: Theme): ResolvedTheme {
  if (theme === 'dark') {
    return 'light'
  }

  if (theme === 'light') {
    return 'dark'
  }

  return getSystemTheme() === 'dark' ? 'light' : 'dark'
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true']"),
  )
}

function isTheme(value: null | string): value is Theme {
  if (value === null) {
    return false
  }

  return THEME_VALUES.has(value as Theme)
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme
}

function shouldHandleThemeHotkey(event: KeyboardEvent) {
  const hasCommandModifier = event.metaKey || event.ctrlKey
  const shouldIgnore = [
    event.repeat,
    !hasCommandModifier,
    event.altKey,
    event.shiftKey,
    isEditableTarget(event.target),
    event.key.toLowerCase() !== KEYBOARD_SHORTCUTS.themeToggle.key,
  ]

  return !shouldIgnore.some(Boolean)
}

function useApplyTheme(theme: Theme, disableTransitionOnChange: boolean) {
  React.useEffect(() => {
    applyTheme(theme, disableTransitionOnChange)

    if (theme !== 'system') {
      return undefined
    }

    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
    const handleChange = () => {
      applyTheme('system', disableTransitionOnChange)
    }

    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme, disableTransitionOnChange])
}

function useThemeHotkey(
  setThemeState: React.Dispatch<React.SetStateAction<Theme>>,
  storageKey: string,
) {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldHandleThemeHotkey(event)) {
        return
      }

      event.preventDefault()
      setThemeState((currentTheme) => {
        const nextTheme = getToggledTheme(currentTheme)
        localStorage.setItem(storageKey, nextTheme)
        return nextTheme
      })
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [setThemeState, storageKey])
}

function useThemeStorageSync(
  setThemeState: React.Dispatch<React.SetStateAction<Theme>>,
  storageKey: string,
  defaultTheme: Theme,
) {
  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || event.key !== storageKey) {
        return
      }

      setThemeState(isTheme(event.newValue) ? event.newValue : defaultTheme)
    }

    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [defaultTheme, setThemeState, storageKey])
}

/** @public */
// eslint-disable-next-line react-refresh/only-export-components -- Hook intentionally lives with its provider context.
export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext)

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  return context
}
