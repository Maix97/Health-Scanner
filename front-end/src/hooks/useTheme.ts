import { useEffect } from 'react'

export type Theme = 'light' | 'dark' | 'system'

export function applyStoredTheme() {
  const stored = (localStorage.getItem('theme') as Theme) ?? 'system'
  const isDark =
    stored === 'dark' ||
    (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
}

export function setTheme(theme: Theme) {
  localStorage.setItem('theme', theme)
  applyStoredTheme()
}

export function getTheme(): Theme {
  return (localStorage.getItem('theme') as Theme) ?? 'system'
}

// Call once in App (always-mounted) to react to OS preference changes.
export function useSystemThemeSync() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyStoredTheme()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
}
