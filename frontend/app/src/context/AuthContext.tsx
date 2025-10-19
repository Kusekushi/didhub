import React, { createContext, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from './ApiContext'

type UserInfo = { id?: string; username?: string; avatar?: string | null; isAdmin?: boolean; isSystem?: boolean }

type AuthMeResponse = {
  user_id?: string
  username?: string
  avatar?: string | null
  isSystem?: boolean
  scopes?: string[]
}

type AuthContextType = {
  isAuthenticated: boolean
  user: UserInfo | null
  isAdmin: boolean
  initializing: boolean
  // login optionally accepts redirect options so AuthContext can perform navigation
  login: (username: string, password: string, options?: { redirectTo?: string; redirectDelay?: number }) => Promise<void>
  signup: (username: string, password: string, displayName?: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setAuthenticated] = useState(false)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const navigate = useNavigate()
  const client = useApi()

  useEffect(() => {
    // Probe the server to see if a session cookie exists
    ; (async () => {
      try {
        const res = await client.request('GET', '/auth/me', false, {})
        const data = res.data as AuthMeResponse
        if (data) {
          const isAdmin = data.scopes?.includes('admin') || false
          setUser({ id: data.user_id, username: data.username, avatar: data.avatar, isAdmin, isSystem: data.isSystem })
          setIsAdmin(isAdmin)
        } else {
          setUser(null)
          setIsAdmin(false)
        }
        setAuthenticated(true)
      } catch {
        setUser(null)
        setIsAdmin(false)
        setAuthenticated(false)
      }
      finally {
        setInitializing(false)
      }
    })()
  }, [client])

  async function login(username: string, password: string, options?: { redirectTo?: string; redirectDelay?: number }) {
    try {
      // Fetch CSRF token and include it for the login POST (double-submit cookie pattern)
      const csrf = await client.fetchCsrfToken()
      // Server should set an HttpOnly cookie on successful login
      await client.request('POST', '/auth/login', true, { body: { username, password }, headers: { 'x-csrf-token': csrf } })
      // probe /auth/me for user info
      const res = await client.request('GET', '/auth/me', false, {})
      const data = res.data as AuthMeResponse
      if (data) {
        const isAdmin = data.scopes?.includes('admin') || false
        setUser({ id: data.user_id, username: data.username, avatar: data.avatar, isAdmin })
        setIsAdmin(isAdmin)
      } else {
        setUser(null)
        setIsAdmin(false)
      }
      setAuthenticated(true)
      // perform optional SPA redirect
      if (options?.redirectTo) {
        const delay = options.redirectDelay ?? 0
        if (delay > 0) {
          setTimeout(() => navigate(options.redirectTo!, { replace: true }), delay)
        } else {
          navigate(options.redirectTo, { replace: true })
        }
      }
    } catch (error: unknown) {
      // Check if it's a 403 with "Account awaiting approval" message
      const err = error as { status?: number; payload?: { error?: string } }
      if (err?.status === 403 && err?.payload?.error === 'forbidden: Account awaiting approval') {
        navigate('/awaiting-approval', { replace: true })
        return
      }
      // Re-throw other errors
      throw error
    }
  }

  async function logout() {
    try {
      await client.request('POST', '/auth/logout', false, {})
    } finally {
      setUser(null)
      setIsAdmin(false)
      setAuthenticated(false)
    }
  }

  async function signup(username: string, password: string, displayName?: string) {
    // create user via generated users endpoint
    const body: { username: string; password: string; display_name?: string } = { username, password, display_name: displayName }
    await client.request('POST', '/users', true, { body })
    // After creating the user, perform login to set session cookie
    await login(username, password)
  }

  return <AuthContext.Provider value={{ isAuthenticated, user, isAdmin, initializing, login, signup, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
