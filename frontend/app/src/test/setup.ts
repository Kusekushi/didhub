// src/test/setup.ts
import { mock } from 'bun:test'

// Initialize jsdom for testing React components
// This must be done before any test files import React
import { JSDOM } from 'jsdom'

const jsdom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
})

const window = jsdom.window as unknown as Window & typeof globalThis

// Copy the jsdom window onto globalThis so unqualified references resolve to
// the same realm (document, localStorage, Event, MutationObserver, ...).
// Existing globals (fetch, Response, setTimeout, ...) are left untouched.
for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis) continue
  const value = window[key as keyof typeof window]
  if (typeof value === 'undefined') continue
  ;(globalThis as Record<string, unknown>)[key] = value
}

globalThis.window = window
globalThis.document = jsdom.window.document
globalThis.navigator = jsdom.window.navigator

// jsdom doesn't implement matchMedia which sonner reads; stub it for tests
if (typeof window !== 'undefined' && !window.matchMedia) {
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

// Mock the Particles component to avoid canvas issues in tests
mock.module('@/components/ui/particles', () => ({
  Particles: () => null,
}))
