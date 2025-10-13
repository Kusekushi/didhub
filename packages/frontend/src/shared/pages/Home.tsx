import React from 'react';

import { Box, Container, Typography, Stack, Button } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DeviceHubIcon from '@mui/icons-material/DeviceHub';

import { useAuth } from '../../shared/contexts/AuthContext';

export default function Home(): React.ReactElement {
  const { user } = useAuth();

  const welcome = (
    <Box sx={{ bgcolor: 'background.paper', py: 4, mb: 3, borderRadius: 1, boxShadow: 1 }}>
      <Container>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              Welcome back!
            </Typography>
            <Typography color="text.secondary">
              Quick access to systems. Use the actions to jump straight to common tasks.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button startIcon={<DashboardIcon />} variant="contained" color="primary" href="systems">
              View systems
            </Button>
            <Button startIcon={<PersonIcon />} variant="outlined" href="profile">
              Profile
            </Button>
            {user.is_system && (
              <Button startIcon={<DeviceHubIcon />} variant="outlined" href="admin">
                Jump to own system
              </Button>
            )}
            {user.is_admin && (
              <Button startIcon={<DeviceHubIcon />} variant="outlined" href="admin">
                System admin
              </Button>
            )}
          </Stack>
        </Stack>
      </Container>
    </Box>
  );

  return (
    <Container sx={{ mt: 2 }}>
      {welcome}
    </Container>
  );
}
