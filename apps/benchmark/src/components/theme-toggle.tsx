import { Button } from '@workspace/ui/components/button'
import { MoonIcon, SunIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

const STORAGE_KEY = 'benchmark-theme'
const THEME_VALUES = new Set<Theme>(['dark', 'light'])

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('dark', 'light')
    root.classList.add(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const isDark = theme === 'dark'

  return (
    <Button
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      size="sm"
      type="button"
      variant="outline"
    >
      {isDark ? (
        <SunIcon data-icon="inline-start" />
      ) : (
        <MoonIcon data-icon="inline-start" />
      )}
      {isDark ? 'Light' : 'Dark'}
    </Button>
  )
}

function getInitialTheme(): Theme {
  const storedTheme = localStorage.getItem(STORAGE_KEY)
  if (isTheme(storedTheme)) return storedTheme
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function isTheme(value: null | string): value is Theme {
  return value !== null && THEME_VALUES.has(value as Theme)
}
