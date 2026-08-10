import React from 'react'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/theme'
import { ApiProvider } from './context/ApiContext'
import { SettingsProvider } from './context/SettingsContext'
import { AuthProvider } from './context/AuthContext'

// Central provider tree. Order matters: ApiProvider depends on ToastContext,
// so ToastProvider must be an ancestor of ApiProvider.
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ThemeProvider>
        <ApiProvider>
          <SettingsProvider>
            <AuthProvider>{children}</AuthProvider>
          </SettingsProvider>
        </ApiProvider>
      </ThemeProvider>
    </ToastProvider>
  )
}
