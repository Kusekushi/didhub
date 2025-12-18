import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, mock } from 'bun:test'

// Mock useAuth to supply a user without avatar
mock.module('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'TestUser' },
    logout: async () => {},
  }),
}))

// Mock react-router-dom useNavigate used in the component
mock.module('react-router-dom', () => ({
  useNavigate: () => {
    return () => {}
  },
}))

// Mock ApiContext to provide a basic API client
mock.module('@/context/ApiContext', () => ({
  useApi: () => ({
    serveStoredFile: async () => ({ data: { url: '/test-avatar.png' } }),
  }),
  ApiProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Import the component after mocks
import UserMenu from '@/components/ui/user-menu'

describe('UserMenu', () => {
  it('renders user initial when no avatar', async () => {
    const { container } = render(<UserMenu compact={true} />)

    // Give async effects time to complete
    await new Promise(resolve => setTimeout(resolve, 50))

    // Should display the first letter of username
    expect(container.textContent).toContain('T')
  })
})
