import React from 'react';
import { Stack, MenuItem } from '@mui/material';
import { AccountPreview, SignOutButton } from '@toolpad/core';
import { Link as RouterLink } from 'react-router-dom';

/**
 * Account popover content component
 */
export default function AccountPopoverContent() {
  return (
    <Stack spacing={1} sx={{ p: 1 }}>
      <AccountPreview />
      <MenuItem component={RouterLink} to="/user-settings">
        User settings
      </MenuItem>
      <SignOutButton />
    </Stack>
  );
}
