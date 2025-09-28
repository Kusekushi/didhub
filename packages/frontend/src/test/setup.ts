import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock the API client
vi.mock('@didhub/api-client', () => ({
  listGroups: vi.fn(),
  listSubsystems: vi.fn(),
  fetchAltersBySystem: vi.fn(),
  fetchAltersSearch: vi.fn(),
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  createSubsystem: vi.fn(),
  updateSubsystem: vi.fn(),
  deleteSubsystem: vi.fn(),
  listSystems: vi.fn(),
  createSystem: vi.fn(),
  updateSystem: vi.fn(),
  deleteSystem: vi.fn(),
  changePassword: vi.fn(),
  shareGroup: vi.fn(),
  unshareGroup: vi.fn(),
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
  useLocation: vi.fn(),
  useParams: vi.fn(),
  Link: vi.fn(),
  Navigate: vi.fn(),
}));

// Mock MUI components that might cause issues in tests
vi.mock('@mui/material', () => ({
  ...vi.importActual('@mui/material'),
  Dialog: vi.fn(),
  Drawer: vi.fn(),
  Snackbar: vi.fn(),
}));

// Global test utilities
global.matchMedia = global.matchMedia || function() {
  return {
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };
};