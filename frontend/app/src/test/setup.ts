// src/test/setup.ts
import { mock } from 'bun:test'

// Initialize jsdom for testing React components
// This must be done before any test files import React
import { JSDOM } from 'jsdom'

const jsdom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
})

globalThis.window = jsdom.window as unknown as Window & typeof globalThis
globalThis.document = jsdom.window.document
globalThis.navigator = jsdom.window.navigator

// Mock the Particles component to avoid canvas issues in tests
mock.module('@/components/ui/particles', () => ({
  Particles: () => null,
}))