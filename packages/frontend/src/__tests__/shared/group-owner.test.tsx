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

const { createMock, listMock } = vi.hoisted(() => ({
  createMock: vi.fn(async (payload: any) => ({ data: { id: 123, ...payload } })),
  listMock: vi.fn(async () => ({ data: { items: [], total: 0 } })),
}));

vi.mock('@didhub/api-client', async () => {
  const actual = await vi.importActual<any>('@didhub/api-client');
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      group: {
        ...actual.apiClient.group,
        post_groups: createMock,
        get_groups: listMock,
      },
    },
  };
});

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import GroupDialog from '../../features/system/GroupDialog';

describe('GroupDialog owner propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends owner_user_id from uid prop when provided', async () => {
    createMock.mockClear();
    listMock.mockClear();

    const { findByLabelText, findByText } = render(
      <GroupDialog
        mode="create"
        open={true}
        onClose={() => {}}
        uid={'42'}
        uploadFiles={async () => []}
        onCreated={async () => {}}
      />,
    );

    const nameInput = await findByLabelText('Name');
    await fireEvent.change(nameInput, { target: { value: 'My Group' } });

    const createButton = await findByText('Create');
    await fireEvent.click(createButton);

    await waitFor(() => {
      expect(createMock).toHaveBeenCalled();
    });
    const payload = createMock.mock.calls[0][0] as any;
    expect(payload.owner_user_id).toBe(42);
  });
});
