import { GalleryVerticalEnd } from 'lucide-react'
import React, { useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useToast } from '@/context/ToastContext'

import { SignupForm } from '@/components/signup-form'
import { Particles } from '@/components/ui/particles'
import { useAuth } from '@/context/AuthContext'

export default function SignupPage() {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const auth = useAuth()
  const toast = useToast()
  const location = useLocation()

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const next = searchParams.get('next') || '/'

  function validate() {
    if (!username || username.trim().length === 0) return 'Please enter a username'
    if (!displayName || displayName.trim().length === 0) return 'Please enter a display name'
    if (!password || password.length < 8) return 'Password must be at least 8 characters'
    if (password !== confirmPassword) return 'Passwords do not match'
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setLoading(true)
    try {
      await auth.signup(username, password, displayName)
      toast.show({ title: 'Account created', description: 'Welcome! Redirecting...', variant: 'success' })
      await auth.login(username, password, { redirectTo: next, redirectDelay: 350 })
    } catch (err: unknown) {
      const error = err as { payload?: { error?: string }; message?: string }
      setError(error?.payload?.error ?? error?.message ?? 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  const isDirty = username !== '' || displayName !== '' || password !== '' || confirmPassword !== ''
  const isValid = validate() === null
  const disabled = !isDirty || !isValid || loading

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="#" className="flex items-center gap-2 font-medium">
            <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-4" />
            </div>
            DIDHub
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <SignupForm
              username={username}
              displayName={displayName}
              password={password}
              confirmPassword={confirmPassword}
              onUsernameChange={setUsername}
              onDisplayNameChange={setDisplayName}
              onPasswordChange={setPassword}
              onConfirmPasswordChange={setConfirmPassword}
              onSubmit={submit}
              loading={loading}
              error={error}
              disabled={disabled}
            />
          </div>
        </div>
      </div>
      <div className="bg-muted relative hidden lg:block">
        <Particles />
      </div>
    </div>
  )
}