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
  createMock: vi.fn(async (payload: any) => ({ id: 123, ...payload })),
  listMock: vi.fn(async () => ({ items: [], total: 0 })),
}));

vi.mock('../../services/groupService', async () => {
  return {
    createGroup: createMock,
    listGroups: listMock,
  } as any;
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

    const ownerUuid = '11111111-1111-1111-1111-111111111111';
    const { findByLabelText, findByText } = render(
      <GroupDialog
        mode="create"
        open={true}
        onClose={() => {}}
        uid={ownerUuid}
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
    expect(payload.owner_user_id).toBe(ownerUuid);
  });
});
