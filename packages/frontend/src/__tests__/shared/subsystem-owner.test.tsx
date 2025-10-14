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

const { createSubsystemMock, listSubsystemsMock } = vi.hoisted(() => ({
  createSubsystemMock: vi.fn(async (payload: any) => ({ id: 321, ...payload })),
  listSubsystemsMock: vi.fn(async () => ({ items: [], total: 0 })),
}));

vi.mock('../../services/subsystemService', async () => ({
  createSubsystem: createSubsystemMock,
  listSubsystems: listSubsystemsMock,
} as any));

import SubsystemsTab from '../../features/system/SubsystemsTab';

describe('Subsystems owner propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends owner_user_id from uid prop when provided (create subsystem)', async () => {
    const mockCreate = createSubsystemMock;

    const ownerUuid = '11111111-1111-1111-1111-111111111111';
    const { findByText, getByLabelText } = render(<SubsystemsTab uid={ownerUuid} />);

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
    expect(payload.owner_user_id).toBe(ownerUuid);
  });
});
