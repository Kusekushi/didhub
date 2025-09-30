import React, { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { SignInPage } from '@toolpad/core';
import { Checkbox, FormControlLabel, IconButton, InputAdornment, Link } from '@mui/material';
import AuthLayout from '../components/AuthLayout';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

import { useAuth } from '../contexts/AuthContext';
import { fetchOidcList } from '@didhub/api-client';

type Provider = {
  id: string;
  name: string;
};

type SignInResponse = { success?: string; error?: string } | undefined;

export default function Login(): React.ReactElement {
  const { login } = useAuth();
  // AuthLayout provides AppProvider and themed Container

  const [providers, setProviders] = useState<Provider[]>([]);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadProviders() {
      try {
        const list = await fetchOidcList();
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
    async (provider?: Provider | null, formData?: FormData, callbackUrl?: string): Promise<SignInResponse> => {
      if (provider?.id === 'credentials') {
        const username = formData?.get('username')?.toString() ?? '';
        const password = formData?.get('password')?.toString() ?? '';
        const result = await login(username, password);

        if (result.ok) {
          const isValidCallback = callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.includes('://');
          const dest = isValidCallback ? callbackUrl : '/';
          window.location.href = dest;
          return { success: '' };
        }

        if (result.pending) {
          window.location.href = '/awaiting-approval';
          return { success: '' };
        }

        return { error: result.error ?? 'Sign in failed' };
      }

      // Validate provider is in the allowed list
      if (provider?.id && !providers.some((p) => p.id === provider.id)) {
        return { error: 'Invalid provider' };
      }

      // OAuth / external providers: redirect to server endpoint
      if (provider?.id) {
        window.location.href = '/api/oidc/' + encodeURIComponent(provider.id) + '/authorize';
      }

      return undefined;
    },
    [login, providers],
  );

  return (
    <AuthLayout>
      <SignInPage
        signIn={signIn}
        providers={providers}
        slotProps={{
          emailField: {
            autoFocus: true,
            name: 'username',
            label: 'Username',
            placeholder: 'your username',
          },
          passwordField: {
            name: 'password',
            label: 'Password',
            type: showPassword ? 'text' : 'password',
            InputProps: {
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
            },
          },
          form: { noValidate: true },
          rememberMe: { label: 'Remember me?', control: <Checkbox /> },
        }}
        slots={{
          signUpLink: (props: ComponentProps<typeof Link>) => (
            <Link href="/register" {...props}>
              Sign up
            </Link>
          ),
          rememberMe: (props: ComponentProps<typeof FormControlLabel>) => {
            const { label, ...rest } = props;
            return <FormControlLabel control={<Checkbox />} label={label ?? 'Remember me?'} {...rest} />;
          },
        }}
        localeText={{ email: 'Username' }}
      />
    </AuthLayout>
  );
}
