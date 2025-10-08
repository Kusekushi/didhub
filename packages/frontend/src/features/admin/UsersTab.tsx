import React from 'react';
import { Typography } from '@mui/material';
import UserListPanel from './UserListPanel';

export default function UsersTab() {
  return (
    <>
      <Typography variant="h5" gutterBottom>
        Users
      </Typography>
      <UserListPanel />
    </>
  );
}
