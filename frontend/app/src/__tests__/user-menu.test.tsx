import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiProvider } from '@/context/ApiContext'

// Mock useAuth to supply a user with an avatar id
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { avatar: '11111111-1111-1111-1111-111111111111', username: 'TestUser' },
    logout: async () => {},
  }),
}))

// Mock react-router-dom useNavigate used in the component
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => {
      return () => {}
    },
  }
})

// Import the component after mocks
import UserMenu from '@/components/ui/user-menu'

describe('UserMenu avatar loading', () => {
  beforeEach(() => {
    // mock fetch for the files metadata endpoint
    global.fetch = vi.fn((input: RequestInfo) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/api/files/')) {
        return Promise.resolve(new Response(JSON.stringify({ url: '/api/files/content/11111111-1111-1111-1111-111111111111' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }))
      }
      return Promise.resolve(new Response(null, { status: 404 }))
    }) as typeof fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders avatar img with src from files metadata url', async () => {
    render(<ApiProvider><UserMenu compact={true} /></ApiProvider>)

    // The component shows an <img alt="avatar"> when avatar data is available
    const img = await screen.findByAltText('avatar')
    // Basic assertions without jest-dom matchers
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toBe('/api/files/content/11111111-1111-1111-1111-111111111111')
  })
})
