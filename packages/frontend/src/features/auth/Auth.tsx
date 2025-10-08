import React, { useCallback, useEffect, useState } from 'react';
import { Checkbox, FormControlLabel, IconButton, InputAdornment, Link, TextField, Button, Box, Typography, Alert, Paper, Stack } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { apiClient } from '@didhub/api-client';

import { useAuth } from '../../shared/contexts/AuthContext';
import AuthLayout from '../../components/common/AuthLayout';

type Provider = {
  id: string;
  name: string;
};

export default function Login(): React.ReactElement {
  const { login } = useAuth();
  // AuthLayout provides AppProvider and themed Container

  const [providers, setProviders] = useState<Provider[]>([]);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadProviders() {
      try {
        const list = await apiClient.oidc.list();
        const arr: Provider[] = Array.isArray(list) ? list : [];
        arr.push({ id: 'credentials', name: 'Username and Password' });
        if (mounted) setProviders(arr);
      } catch (err) {
        // ignore - leave providers empty on error
        if (mounted) setProviders([{ id: 'credentials', name: 'Username and Password' }]);
      }
    }

    loadProviders();
    return () => {
      mounted = false;
    };
  }, []);

  const signIn = useCallback(
    async (provider?: Provider | null, formData?: FormData, callbackUrl?: string) => {
      if (provider?.id === 'credentials') {
        const username = formData?.get('username')?.toString() ?? '';
        const password = formData?.get('password')?.toString() ?? '';
        const result = await login(username, password);

        if (result.ok) {
          const isValidCallback = callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.includes('://');
          const dest = isValidCallback ? callbackUrl : '/';
          window.location.href = dest;
          return { success: '' } as any;
        }

        if ((result as any).pending) {
          window.location.href = '/awaiting-approval';
          return { success: '' } as any;
        }

        return { error: result.error || 'Sign in failed' } as any;
      }

      // Validate provider is in the allowed list
      if (provider?.id && !providers.some((p) => p.id === provider.id)) {
        return { error: 'Invalid provider' } as any;
      }

      // OAuth / external providers: redirect to server endpoint
      if (provider?.id) {
        window.location.href = '/api/oidc/' + encodeURIComponent(provider.id) + '/authorize';
      }

      return undefined;
    },
    [login, providers],
  );

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await login(username, password);

      if (result.ok) {
        const isValidCallback = window.location.search.includes('callbackUrl=') ?
          new URLSearchParams(window.location.search).get('callbackUrl') : null;
        const dest = isValidCallback && isValidCallback.startsWith('/') && !isValidCallback.includes('://') ? isValidCallback : '/';
        window.location.href = dest;
      } else if ((result as any).pending) {
        window.location.href = '/awaiting-approval';
      } else {
        setError(result.error || 'Sign in failed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleProviderSignIn = (provider: Provider) => {
    if (provider.id === 'credentials') {
      // Handle credentials form
      return;
    }
    // OAuth / external providers: redirect to server endpoint
    window.location.href = '/api/oidc/' + encodeURIComponent(provider.id) + '/authorize';
  };

  return (
    <AuthLayout>
      <Paper elevation={2} sx={{ p: 3, maxWidth: 400, width: '100%' }}>
        <Typography variant="h5" gutterBottom align="center">
          Sign in
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="username"
            label="Username"
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your username"
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((s) => !s)}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <FormControlLabel
            control={<Checkbox value={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} color="primary" />}
            label="Remember me?"
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </Box>

        {providers.filter(p => p.id !== 'credentials').map((provider) => (
          <Button
            key={provider.id}
            fullWidth
            variant="outlined"
            sx={{ mt: 1 }}
            onClick={() => handleProviderSignIn(provider)}
          >
            Sign in with {provider.name}
          </Button>
        ))}

        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Link href="/register" variant="body2">
            Don't have an account? Sign up
          </Link>
        </Box>
      </Paper>
    </AuthLayout>
  );
}
