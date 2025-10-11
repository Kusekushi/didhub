import React from 'react';
import { Stack, MenuItem, Avatar, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../../shared/contexts/AuthContext';

/**
 * Account popover content component
 */
export default function AccountPopoverContent() {
  const { user, logout } = useAuth();

  const handleSignOut = async () => {
    await logout();
  };

  return (
    <Stack spacing={1} sx={{ p: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1 }}>
        <Avatar src={user?.avatar ? `/uploads/${user.avatar}` : undefined} sx={{ width: 32, height: 32 }}>
          {user?.username?.charAt(0).toUpperCase()}
        </Avatar>
        <Stack>
          <Typography variant="body2" fontWeight="medium">
            {(user as any)?.username || (user as any)?.name}
          </Typography>
        </Stack>
      </Stack>
      <MenuItem component={RouterLink} to="/user-settings">
        User settings
      </MenuItem>
      <MenuItem onClick={handleSignOut}>Sign out</MenuItem>
    </Stack>
  );
}
