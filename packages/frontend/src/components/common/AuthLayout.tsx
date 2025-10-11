import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { Box, Container, Typography, useTheme, SxProps, Theme } from '@mui/material';

export interface AuthLayoutProps {
  children?: React.ReactNode;
  title?: string;
  maxWidth?: number | string;
  containerSx?: SxProps<Theme>;
}

export default function AuthLayout(props: AuthLayoutProps) {
  const maxWidth = props.maxWidth === undefined ? 600 : props.maxWidth;
  const theme = useTheme();

  return (
    <ThemeProvider theme={theme}>
      <Container
        sx={{
          mt: 6,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '80vh',
          ...(props.containerSx || {}),
        }}
      >
        <Box sx={{ width: '100%', maxWidth, px: 2, display: 'flex', justifyContent: 'center' }}>
          <Box sx={{ width: '100%', maxWidth: 400 }}>
            {props.title ? (
              <Typography variant="h4" gutterBottom>
                {props.title}
              </Typography>
            ) : null}

            {props.children}
          </Box>
        </Box>
      </Container>
    </ThemeProvider>
  );
}
