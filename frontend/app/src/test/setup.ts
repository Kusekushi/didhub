// src/test/setup.ts
import { mock } from 'bun:test'

// Initialize jsdom for testing React components
// This must be done before any test files import React
import { JSDOM } from 'jsdom'

const jsdom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
})

global.window = jsdom.window as any
global.document = jsdom.window.document as any
global.navigator = jsdom.window.navigator as any

// Mock the Particles component to avoid canvas issues in tests
mock.module('@/components/ui/particles', () => ({
  Particles: () => null,
}))