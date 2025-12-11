import React, { useState, useMemo } from 'react'
import { LoginForm } from '@/components/login-form'
import { useAuth } from '@/context/AuthContext'
import { GalleryVerticalEnd } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useToast } from '@/context/ToastContext'
import { Particles } from '@/components/ui/particles'

export default function LoginPage() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const auth = useAuth()
    const location = useLocation()

    const toast = useToast()
    const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
    const next = searchParams.get('next') || '/'
    // prefer a location.state.from (set by ProtectedRoute) over ?next
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname
    const target = from || next || '/'

    function validate() {
        if (!username || username.trim().length === 0) return 'Please enter a username'
        if (!password || password.length < 6) return 'Password must be at least 6 characters'
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
            // show a small toast then let AuthContext handle redirect for consistency
            toast.show({ title: 'Signed in', description: 'Redirecting...', variant: 'success' })
            await auth.login(username, password, { redirectTo: target, redirectDelay: 350 })
        } catch (err: unknown) {
            const error = err as { payload?: { error?: string }; message?: string }
            setError(error?.payload?.error ?? error?.message ?? 'Login failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="grid min-h-svh lg:grid-cols-2">
            <div className="flex flex-col gap-4 p-6 md:p-10">
                <div className="flex justify-center gap-2 md:justify-start">
                    <Link to="/" className="flex items-center gap-2 font-medium">
                        <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
                            <GalleryVerticalEnd className="size-4" />
                        </div>
                        DIDHub
                    </Link>
                </div>
                <div className="flex flex-1 items-center justify-center">
                    <div className="w-full max-w-xs">
                        <LoginForm
                            username={username}
                            password={password}
                            onUsernameChange={setUsername}
                            onPasswordChange={setPassword}
                            onSubmit={submit}
                            loading={loading}
                            error={error}
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
