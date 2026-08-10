import { describe, it, expect } from 'bun:test'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppProviders } from '@/providers'
import App from '@/App'

// Stub fetch so the real ApiClient never hits the network in tests.
// Returning 401 makes AuthContext treat the user as logged out, which
// exercises the full provider tree (including ApiProvider -> ToastProvider).
globalThis.fetch = (async () =>
  new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })) as unknown as typeof fetch

describe('App boot (real provider tree)', () => {
  it('mounts without crashing and redirects unauthenticated users to /login', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>
    )

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /login to your account/i })).toBeDefined()
    )
  })
})
