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
  createAlterMock: vi.fn(async (payload: any) => ({ data: { id: 555, ...payload } })),
  putAlterRelationshipsMock: vi.fn(async () => ({})),
  putUserRelationshipsMock: vi.fn(async () => ({})),
  getAlterNamesMock: vi.fn(async () => ({ data: [] })),
  getAltersMock: vi.fn(async () => ({ data: { items: [], total: 0 } })),
  getAlterByIdMock: vi.fn(async () => ({ data: null })),
  getUsersMock: vi.fn(async () => ({ data: { items: [], total: 0 } })),
  postUploadMock: vi.fn(async () => ({ data: { filename: 'upload.png' } })),
  groupListMock: vi.fn(async () => ({ data: { items: [], total: 0 } })),
  subsystemListMock: vi.fn(async () => ({ data: { items: [], total: 0 } })),
}));

vi.mock('@didhub/api-client', async () => {
  const actual = await vi.importActual<any>('@didhub/api-client');
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      alter: {
        ...actual.apiClient.alter,
        post_alters: createAlterMock,
        put_alters_by_id_alter_relationships: putAlterRelationshipsMock,
        put_alters_by_id_user_relationships: putUserRelationshipsMock,
        get_alters_names: getAlterNamesMock,
        get_alters: getAltersMock,
        get_alters_by_id: getAlterByIdMock,
      },
      admin: {
        ...actual.apiClient.admin,
        get_users: getUsersMock,
      },
      files: {
        ...actual.apiClient.files,
        post_upload: postUploadMock,
      },
      group: {
        ...actual.apiClient.group,
        get_groups: groupListMock,
      },
      subsystem: {
        ...actual.apiClient.subsystem,
        get_subsystems: subsystemListMock,
      },
    },
  };
});

import AlterFormDialog from '../../components/forms/AlterFormDialog';

describe('AlterFormDialog owner propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends owner_user_id from routeUid prop when provided', async () => {
    const { findByLabelText, findByText } = render(
      <AlterFormDialog mode="create" open={true} onClose={() => {}} routeUid={'42'} />,
    );

    const nameInput = await findByLabelText('Name');
    await fireEvent.change(nameInput, { target: { value: 'Alice' } });

  const createButton = await findByText('Create');
  await fireEvent.click(createButton);

    await waitFor(() => {
      expect(createAlterMock).toHaveBeenCalled();
    });
    const payload = createAlterMock.mock.calls[0][0];
    expect(payload.owner_user_id).toBe(42);
  });
});
