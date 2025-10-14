import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';

// Mock MUI Dialog to render children inline
vi.mock('@mui/material', async () => {
  const actual = await vi.importActual('@mui/material');
  return {
    ...actual,
    Dialog: ({ PaperProps, children }: any) => {
      if (PaperProps?.component === 'form') {
        return (
          <form onSubmit={PaperProps.onSubmit} data-testid="mock-dialog-form">
            {children}
          </form>
        );
      }
      return <div>{children}</div>;
    },
    DialogTitle: (props: any) => <div>{props.children}</div>,
    DialogContent: (props: any) => <div>{props.children}</div>,
    DialogActions: (props: any) => <div>{props.children}</div>,
  };
});

vi.mock('../../shared/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 } }),
  AuthProvider: ({ children }: any) => children,
}));

const {
  createAlterMock,
  putAlterRelationshipsMock,
  putUserRelationshipsMock,
  getAlterNamesMock,
  getAltersMock,
  getAlterByIdMock,
  getUsersMock,
  postUploadMock,
  groupListMock,
  subsystemListMock,
} = vi.hoisted(() => ({
  createAlterMock: vi.fn(async (payload: any) => ({ id: 555, ...payload })),
  putAlterRelationshipsMock: vi.fn(async () => ({})),
  putUserRelationshipsMock: vi.fn(async () => ({})),
  getAlterNamesMock: vi.fn(async () => []),
  getAltersMock: vi.fn(async () => ({ items: [], total: 0 })),
  getAlterByIdMock: vi.fn(async () => null),
  getUsersMock: vi.fn(async () => ({ items: [], total: 0 })),
  postUploadMock: vi.fn(async () => ({ filename: 'upload.png' })),
  groupListMock: vi.fn(async () => ({ items: [], total: 0 })),
  subsystemListMock: vi.fn(async () => ({ items: [], total: 0 })),
}));

vi.mock('../../services/alterService', async () => ({
  createAlter: createAlterMock,
  replaceAlterRelationships: putAlterRelationshipsMock,
  replaceUserRelationships: putUserRelationshipsMock,
  getAlterNamesFallback: getAlterNamesMock,
  listAlters: getAltersMock,
  getAlterById: getAlterByIdMock,
} as any));

vi.mock('../../services/adminService', async () => ({
  getUsers: getUsersMock,
} as any));

vi.mock('../../services/fileService', async () => ({
  uploadFile: postUploadMock,
} as any));

vi.mock('../../services/groupService', async () => ({
  listGroups: groupListMock,
} as any));

vi.mock('../../services/subsystemService', async () => ({
  listSubsystems: subsystemListMock,
} as any));

import AlterFormDialog from '../../components/forms/AlterFormDialog';

describe('AlterFormDialog owner propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends owner_user_id from routeUid prop when provided', async () => {
    const ownerUuid = '11111111-1111-1111-1111-111111111111';
    const { findByLabelText, findByText } = render(
      <AlterFormDialog mode="create" open={true} onClose={() => {}} routeUid={ownerUuid} />,
    );

    const nameInput = await findByLabelText('Name');
    await fireEvent.change(nameInput, { target: { value: 'Alice' } });

    const createButton = await findByText('Create');
    await fireEvent.click(createButton);

    await waitFor(() => {
      expect(createAlterMock).toHaveBeenCalled();
    });
    const payload = createAlterMock.mock.calls[0][0];
    expect(payload.owner_user_id).toBe(ownerUuid);
  });
});
