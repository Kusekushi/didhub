import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock MUI Dialog to render children inline (avoid portal/transition timing issues)
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
  useAuth: () => ({ user: { id: 1 } }),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock('@didhub/api-client', async () => {
  const actual = await vi.importActual('@didhub/api-client');
  return {
    ...actual,
    apiClient: {
      groups: {
        create: vi.fn(async (payload: any) => ({ id: 123, ...payload })),
      },
    },
  };
});

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import GroupDialog from '../../features/system/GroupDialog';
import { apiClient } from '@didhub/api-client';

describe('GroupDialog owner propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends owner_user_id from uid prop when provided', async () => {
  const { findByLabelText, findByText } = render(
        <GroupDialog
          mode="create"
          open={true}
          onClose={() => {}}
          uid={'42'}
          uploadFiles={async () => []}
          onCreated={async () => {}}
        />
    ,
    );

  // Fill in the form
  const nameInput = await findByLabelText('Name');
  await fireEvent.change(nameInput, { target: { value: 'My Group' } });

  const createButton = await findByText('Create');
  await fireEvent.click(createButton);

    // assert groups.create got called with owner_user_id === 42
  const groupsCreate = (apiClient as any).groups.create as any;
  expect(groupsCreate).toHaveBeenCalled();
  const payload = groupsCreate.mock.calls[0][0] as any;
  expect(payload.owner_user_id).toBe(42);
  });
});
