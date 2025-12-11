import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import LoginPage from '@/pages/Login'
import { ToastProvider } from '@/context/ToastContext'
import { AuthProvider } from '@/context/AuthContext'
import { ApiProvider } from '@/context/ApiContext'

// Mock the ApiClient used inside AuthContext so login/signup succeed
vi.mock('@didhub/api', () => {
  return {
    ApiClient: class {
      base: string
      constructor(base: string) {
        this.base = base
      }
      async fetchCsrfToken() {
        return 'csrf-token'
      }
      async request(method: string, path: string) {
        if (method === 'POST' && path === '/auth/login') {
          return { status: 200 }
        }
        if (method === 'GET' && path === '/auth/me') {
          return { data: { id: '1', username: 'testuser' } }
        }
        if (method === 'POST' && path === '/users') {
          return { status: 201 }
        }
        return {}
      }
    },
  }
})

// Use the real AuthContext (AuthProvider) and mock the ApiClient instead above

// jsdom doesn't implement matchMedia which sonner reads; stub it for tests
if (typeof window !== 'undefined' && !window.matchMedia) {
  // @ts-expect-error - matchMedia stub for jsdom
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

describe('Login redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to `from` location when provided in state', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: { pathname: '/protected', search: '' } } }]}>
        <ApiProvider>
          <AuthProvider>
            <ToastProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/protected" element={<div>PROTECTED</div>} />
                <Route path="/" element={<div>HOME</div>} />
              </Routes>
            </ToastProvider>
          </AuthProvider>
        </ApiProvider>
      </MemoryRouter>
    )

    // fill and submit form
  const usernameInput = screen.getByLabelText(/username/i)
  const passwordInput = container.querySelector('input#password')
  fireEvent.change(usernameInput, { target: { value: 'testuser' } })
  fireEvent.change(passwordInput, { target: { value: 'password123' } })
  const form = container.querySelector('form')
  const submit = form.querySelector('button[type="submit"]')
  fireEvent.click(submit)

    await waitFor(() => expect(screen.getByText('PROTECTED')).toBeDefined())
  })

  it('redirects to / when no next or from provided', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/login"]}>
        <ApiProvider>
          <AuthProvider>
            <ToastProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/protected" element={<div>PROTECTED</div>} />
                <Route path="/" element={<div>HOME</div>} />
              </Routes>
            </ToastProvider>
          </AuthProvider>
        </ApiProvider>
      </MemoryRouter>
    )

    const usernameInput = screen.getByLabelText(/username/i)
    const passwordInput = container.querySelector('input#password')
    fireEvent.change(usernameInput, { target: { value: 'testuser' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
  const form = container.querySelector('form')
  const submit = form.querySelector('button[type="submit"]')
  fireEvent.click(submit)

    await waitFor(() => expect(screen.getByText('HOME')).toBeDefined())
  })
})
