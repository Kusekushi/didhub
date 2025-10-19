// src/test/setup.ts
import { vi } from 'vitest'

// Mock the Particles component to avoid canvas issues in tests
vi.mock('@/components/ui/particles', () => ({
  Particles: () => null,
}))