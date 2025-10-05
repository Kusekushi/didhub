import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';

// Mock MUI Dialog to render children inline
vi.mock('@mui/material', async () => {
  const actual = await vi.importActual('@mui/material');
  return {
    ...actual,
    Dialog: (props: any) => <div>{props.children}</div>,
    DialogTitle: (props: any) => <div>{props.children}</div>,
    DialogContent: (props: any) => <div>{props.children}</div>,
    DialogActions: (props: any) => <div>{props.children}</div>,
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 } }),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock('@didhub/api-client', async () => {
  const actual = await vi.importActual('@didhub/api-client');
  const apiClientMock = (actual as any).apiClient as any;
  return {
    ...actual,
    apiClient: {
      ...apiClientMock,
      alters: {
        create: vi.fn(async (payload: any) => ({ id: 555, ...payload })),
  replaceAlterRelationships: vi.fn(async () => 0),
  replaceUserRelationships: vi.fn(async () => 0),
      },
    },
  };
});

import AlterFormDialog from '../components/AlterFormDialog';
import { apiClient } from '@didhub/api-client';

describe('AlterFormDialog owner propagation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Ensure auxiliary alters/users methods exist and won't throw
    const mod = await import('@didhub/api-client');
    (mod as any).apiClient.alters.names = vi.fn().mockResolvedValue([]);
    (mod as any).apiClient.alters.list = vi.fn().mockResolvedValue({ items: [] });
    (mod as any).apiClient.alters.get = vi.fn();
    (mod as any).apiClient.users.list = vi.fn().mockResolvedValue({ items: [] });
    // Mock group and subsystem list APIs used by child pickers to avoid real fetch URL errors
    (mod as any).apiClient.groups = {
      ...( (mod as any).apiClient.groups || {} ),
      list: vi.fn().mockResolvedValue({ items: [] }),
    };
    (mod as any).apiClient.subsystems = {
      ...( (mod as any).apiClient.subsystems || {} ),
      list: vi.fn().mockResolvedValue({ items: [] }),
    };
  });

  it('sends owner_user_id from routeUid prop when provided', async () => {
    const mockCreate = (apiClient as any).alters.create as any;

    const { findByLabelText, findByText } = render(
      <AlterFormDialog mode="create" open={true} onClose={() => {}} routeUid={'42'} />,
    );

    const nameInput = await findByLabelText('Name');
    await fireEvent.change(nameInput, { target: { value: 'Alice' } });

    const createButton = await findByText('Create');
    await fireEvent.click(createButton);

    expect(mockCreate).toHaveBeenCalled();
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.owner_user_id).toBe(42);
  });
});
