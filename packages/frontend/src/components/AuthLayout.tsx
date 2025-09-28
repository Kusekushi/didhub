import React from 'react';
import { AppProvider } from '@toolpad/core';
import { Box, Container, Typography, useTheme } from '@mui/material';

type Props = {
  children?: React.ReactNode;
  title?: string;
  maxWidth?: number | string;
  containerSx?: any;
};

export default function AuthLayout({ children, title, maxWidth = 600, containerSx }: Props) {
  const theme = useTheme();

  return (
    <AppProvider theme={theme}>
      <Container sx={{ mt: 6, display: 'flex', justifyContent: 'center', ...(containerSx || {}) }}>
        <Box sx={{ width: '100%', maxWidth, px: 2 }}>
          {title ? (
            <Typography variant="h4" gutterBottom>
              {title}
            </Typography>
          ) : null}

          {children}
        </Box>
      </Container>
    </AppProvider>
  );
}
