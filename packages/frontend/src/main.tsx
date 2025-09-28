import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { ReactRouterAppProvider } from '@toolpad/core/react-router';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';

import App from './App';
import ThemeContextProvider from './ThemeContext';
import './style.css';

const NAVIGATION_BASE = [
  { segment: 'home', title: 'Home' },
  { segment: 'systems', title: 'Systems' },
  { segment: 'birthdays', title: 'Birthdays' },
  { segment: 'family-tree', title: 'Family Tree' },
  { segment: 'licenses', title: 'Licenses' },
  { segment: 'login', title: 'Login' },
];

function InnerToolpadApp(): React.ReactElement {
  const theme = useTheme();
  const { user, logout } = useAuth();

  const navigation = React.useMemo(() => {
    let nav = [...NAVIGATION_BASE];
    // If nobody is signed in, hide the main segments and only show login
    if (!user) {
      return nav.filter((item) => item.segment === 'login');
    }
    if (user && (user as any).is_admin) {
      // insert admin before login for visibility
      nav = [...nav.slice(0, nav.length - 1), { segment: 'admin', title: 'Admin' }, nav[nav.length - 1]];
    }
    // For DID-system users, expose a quick link to their system which redirects
    if (user && (user as any).is_system) {
      // insert 'My system' after home
      const idx = nav.findIndex((i) => i.segment === 'home');
      const insertAt = idx >= 0 ? idx + 1 : 0;
      nav = [...nav.slice(0, insertAt), { segment: 'redirect-to-system', title: 'My system' }, ...nav.slice(insertAt)];
    }
    // If the user is signed in but not a DID-system user, remove the 'systems' item
    if (user && !(user as any).is_system) {
      nav = nav.filter((item) => item.segment !== 'systems');
    }
    // hide login when user is signed in
    nav = nav.filter((item) => item.segment !== 'login');
    return nav;
  }, [user]);

  const session = user
    ? {
        user: {
          id: String((user as any).id),
          name: user.username || (user as any).name,
          image: user.avatar ? `/uploads/${user.avatar}` : (user as any).image,
        },
      }
    : undefined;
  const authentication = {
    signOut: async () => {
      await logout();
    },
    signIn: async () => {
      // redirect to our login page
      window.location.href = '/login';
    },
  } as any;

  return (
    <ReactRouterAppProvider
      navigation={navigation}
      theme={theme}
      session={session}
      authentication={authentication}
      branding={{
        logo: <img src="/favicon-32x32.png" alt="DIDHub" style={{ height: 28 }} />,
        title: 'DIDHub',
        homeUrl: '/',
      }}
    >
      <App />
    </ReactRouterAppProvider>
  );
}

function AppWithToolpad(): React.ReactElement {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <InnerToolpadApp />
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeContextProvider>
      <AppWithToolpad />
    </ThemeContextProvider>
  </React.StrictMode>,
);
