import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import Spinner from '@/components/ui/spinner'

// Simple wrapper that renders children if authenticated, otherwise navigates to /login
export const AdminProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth()
  const location = useLocation()

  // While auth is probing the server for an existing session, don't redirect.
  if (auth.initializing) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner className="text-primary" size={6} />
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    // pass the full current URL (pathname + search) in state so Login can redirect back after auth
    const from = { pathname: location.pathname, search: location.search }
    return <Navigate to="/login" replace state={{ from }} />
  }

  if (!auth.isAdmin) {
    // User is authenticated but not admin, redirect to dashboard
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}