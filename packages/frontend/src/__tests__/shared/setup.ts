import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
  useLocation: vi.fn(),
  useParams: vi.fn(),
  Link: vi.fn(),
  Navigate: vi.fn(),
}));

// Mock MUI components that might cause issues in tests while preserving the rest
vi.mock('@mui/material', async () => {
  const actual = await vi.importActual<typeof import('@mui/material')>('@mui/material');

  return {
    ...actual,
    Dialog: vi.fn(() => null),
    Drawer: vi.fn(() => null),
    Snackbar: vi.fn(() => null),
  };
});

// Global test utilities
global.matchMedia =
  global.matchMedia ||
  ((query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
