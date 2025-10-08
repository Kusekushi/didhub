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

vi.mock('../../shared/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 42, is_admin: true } }), // Make user admin so canManage is true
  AuthProvider: ({ children }: any) => children,
}));

vi.mock('@didhub/api-client', async () => {
  const actual = await vi.importActual('@didhub/api-client');
  const apiClientMock = (actual as any).apiClient as any;
  return {
    ...actual,
    apiClient: {
      ...apiClientMock,
      subsystems: {
        create: vi.fn(async (payload: any) => ({ id: 321, ...payload })),
      },
      alters: {
        create: vi.fn(async (payload: any) => ({ id: 999, ...payload })),
  replaceAlterRelationships: vi.fn(async () => 0),
  replaceUserRelationships: vi.fn(async () => 0),
      },
    },
  };
});

import SubsystemsTab from '../../features/system/SubsystemsTab';
import { apiClient } from '@didhub/api-client';

describe('Subsystems owner propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends owner_user_id from uid prop when provided (create subsystem)', async () => {
    const mockCreate = (apiClient as any).subsystems.create as any;

    const { findByText, getByLabelText } = render(
      <SubsystemsTab
        uid={'42'}
      />,
    );

    // Click the create button to open the dialog
    const createSubsystemButton = await findByText('Create Subsystem');
    await fireEvent.click(createSubsystemButton);

    // Fill in the name field
    const nameField = getByLabelText('Name');
    await fireEvent.change(nameField, { target: { value: 'Foo' } });

    const createButton = await findByText('Create');
    await fireEvent.click(createButton);

    expect(mockCreate).toHaveBeenCalled();
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.owner_user_id).toBe(42);
  });
});
