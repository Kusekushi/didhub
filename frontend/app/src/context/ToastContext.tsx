import React, { createContext, useCallback, useContext, useMemo } from 'react'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'
import { toast as sonnerToast } from 'sonner'

type Variant = 'info' | 'success' | 'error'
// sonner manages its own toast objects; no local Toast state type required

type ToastContextType = {
  show: (toast: { title?: string; description?: string; variant?: Variant }) => { dismiss: () => void }
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const show = useCallback((t: { title?: string; description?: string; variant?: Variant }) => {
    const content = t.title ?? t.description ?? ''
    let id: string | number
    if (t.variant === 'success') {
      id = sonnerToast.success(content)
    } else if (t.variant === 'error') {
      id = sonnerToast.error(content)
    } else {
      id = sonnerToast(content)
    }

    const timer = setTimeout(() => {
      try {
        sonnerToast.dismiss(id)
      } catch {
        // ignore
      }
    }, 3500)

    return {
      dismiss: () => {
        clearTimeout(timer)
        try {
          sonnerToast.dismiss(id)
        } catch {
          // ignore
        }
      },
    }
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <SonnerToaster />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export default ToastProvider
