import React from 'react';
import { AppProvider } from '@toolpad/core';
import { Box, Container, Typography, useTheme } from '@mui/material';

export interface AuthLayoutProps {
  children?: React.ReactNode;
  title?: string;
  maxWidth?: number | string;
  containerSx?: any;
}

export default function AuthLayout(props: AuthLayoutProps) {
  const maxWidth = props.maxWidth === undefined ? 600 : props.maxWidth;
  const theme = useTheme();

  return (
    <AppProvider theme={theme}>
      <Container sx={{ mt: 6, display: 'flex', justifyContent: 'center', ...(props.containerSx || {}) }}>
        <Box sx={{ width: '100%', maxWidth, px: 2 }}>
          {props.title ? (
            <Typography variant="h4" gutterBottom>
              {props.title}
            </Typography>
          ) : null}

          {props.children}
        </Box>
      </Container>
    </AppProvider>
  );
}
