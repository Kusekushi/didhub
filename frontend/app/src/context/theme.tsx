"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

type Theme = "light" | "dark"

type ThemeTokens = {
  background: string
  foreground: string
  primary: string
  'primary-foreground': string
  secondary: string
  'secondary-foreground': string
  muted: string
  'muted-foreground': string
  accent: string
  'accent-foreground': string
  destructive: string
  'destructive-foreground': string
  card: string
  'card-foreground': string
  popover: string
  'popover-foreground': string
  border: string
  input: string
  ring: string
  // Gradients
  'gradient-primary': string
  'gradient-secondary': string
  // Typography
  'font-family-sans': string
  'font-family-mono': string
  'font-size-xs': string
  'font-size-sm': string
  'font-size-base': string
  'font-size-lg': string
  'font-size-xl': string
  'font-size-2xl': string
  'font-size-3xl': string
  'font-weight-normal': string
  'font-weight-medium': string
  'font-weight-semibold': string
  'font-weight-bold': string
  'line-height-tight': string
  'line-height-snug': string
  'line-height-normal': string
  'line-height-relaxed': string
  // Spacing
  'spacing-1': string
  'spacing-2': string
  'spacing-3': string
  'spacing-4': string
  'spacing-5': string
  'spacing-6': string
  'spacing-8': string
  'spacing-10': string
  'spacing-12': string
  'spacing-16': string
  'spacing-20': string
  'spacing-24': string
  // Border radius
  'radius-sm': string
  'radius-md': string
  'radius-lg': string
  'radius-xl': string
  // Shadows
  'shadow-sm': string
  'shadow-md': string
  'shadow-lg': string
  'shadow-xl': string
  // Animations
  'animation-duration-fast': string
  'animation-duration-normal': string
  'animation-duration-slow': string
  'animation-easing': string
}

export type { ThemeTokens }

type ThemeContextType = {
  theme: Theme
  isDark: boolean
  toggleTheme: () => void
  tokens: Partial<ThemeTokens>
  setToken: (name: string, value: string) => void
  resetTokens: () => void
  presets: Record<string, Partial<ThemeTokens>>
  savePreset: (name: string) => void
  deletePreset: (name: string) => void
  applyPreset: (name: string) => void
  exportTheme: () => string
  importTheme: (themeData: string) => boolean
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const t = localStorage.getItem("theme")
      if (t === "dark" || t === "light") return t
    } catch { /* ignore localStorage errors */ }
    return "light"
  })

  const [tokens, setTokens] = useState<Partial<ThemeTokens>>(() => {
    try {
      const raw = localStorage.getItem("theme_tokens")
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })

  const [presets, setPresets] = useState<Record<string, Partial<ThemeTokens>>>(() => {
    try {
      const raw = localStorage.getItem("theme_presets")
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })

  // Undo/Redo state
  const [history, setHistory] = useState<Partial<ThemeTokens>[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  useEffect(() => {
    try {
      localStorage.setItem("theme", theme)
    } catch { /* ignore localStorage errors */ }
    if (theme === "dark") document.documentElement.classList.add("dark")
    else document.documentElement.classList.remove("dark")
  }, [theme])

  // Apply tokens when they change
  useEffect(() => {
    try {
      localStorage.setItem("theme_tokens", JSON.stringify(tokens || {}))
    } catch { /* ignore localStorage errors */ }
    // apply tokens as CSS variables
    Object.entries(tokens || {}).forEach(([k, v]) => {
      try {
        document.documentElement.style.setProperty(`--${k}`, v)
      } catch { /* ignore style errors */ }
    })
  }, [tokens])

  // Track history index ref to avoid stale closure in setHistory callback
  const historyIndexRef = React.useRef(historyIndex)
  
  // Keep the ref in sync with the state
  useEffect(() => {
    historyIndexRef.current = historyIndex
  }, [historyIndex])

  // Save to history when tokens change
  useEffect(() => {
    if (Object.keys(tokens).length > 0) {
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndexRef.current + 1)
        newHistory.push({ ...tokens })
        if (newHistory.length > 50) newHistory.shift() // Keep max 50 history items
        return newHistory
      })
      setHistoryIndex(prev => Math.min(prev + 1, 49))
    }
  }, [tokens])

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"))
  }

  function setToken(name: string, value: string) {
    setTokens((prev) => ({ ...(prev || {}), [name]: value }))
  }

  function resetTokens() {
    setTokens({})
    setHistory([])
    setHistoryIndex(-1)
    // remove inline style props so CSS defaults apply
    try {
      const saved = Object.keys(document.documentElement.style).filter((k) => k.startsWith("--"))
      saved.forEach((prop) => {
        document.documentElement.style.removeProperty(prop)
      })
    } catch { /* ignore */ }
    try {
      localStorage.removeItem("theme_tokens")
    } catch { /* ignore */ }
  }

  function savePreset(name: string) {
    setPresets((prev) => {
      const next = { ...(prev || {}), [name]: tokens }
      try {
        localStorage.setItem("theme_presets", JSON.stringify(next))
      } catch { /* ignore */ }
      return next
    })
  }

  function deletePreset(name: string) {
    setPresets((prev) => {
      const next = { ...(prev || {}) }
      delete next[name]
      try {
        localStorage.setItem("theme_presets", JSON.stringify(next))
      } catch { /* ignore */ }
      return next
    })
  }

  function applyPreset(name: string) {
    const p = presets?.[name]
    if (p) {
      setTokens({ ...p })
    }
  }

  function exportTheme(): string {
    return JSON.stringify({
      theme,
      tokens,
      presets
    }, null, 2)
  }

  function importTheme(themeData: string): boolean {
    try {
      const data = JSON.parse(themeData)
      if (data.theme && (data.theme === 'light' || data.theme === 'dark')) {
        setTheme(data.theme)
      }
      if (data.tokens && typeof data.tokens === 'object') {
        setTokens(data.tokens)
      }
      if (data.presets && typeof data.presets === 'object') {
        setPresets(data.presets)
      }
      return true
    } catch {
      return false
    }
  }

  function undo() {
    if (historyIndex > 0) {
      const prevTokens = history[historyIndex - 1]
      setTokens(prevTokens || {})
      setHistoryIndex(historyIndex - 1)
    }
  }

  function redo() {
    if (historyIndex < history.length - 1) {
      const nextTokens = history[historyIndex + 1]
      setTokens(nextTokens || {})
      setHistoryIndex(historyIndex + 1)
    }
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === "dark",
        toggleTheme,
        tokens,
        setToken,
        resetTokens,
        presets,
        savePreset,
        deletePreset,
        applyPreset,
        exportTheme,
        importTheme,
        undo,
        redo,
        canUndo: historyIndex > 0,
        canRedo: historyIndex < history.length - 1,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}

export default ThemeProvider
