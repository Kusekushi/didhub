import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './shared/contexts/AuthContext';
import { SettingsProvider } from './shared/contexts/SettingsContext';
import HomeIcon from '@mui/icons-material/Home';
import PeopleIcon from '@mui/icons-material/People';
import CakeIcon from '@mui/icons-material/Cake';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import DescriptionIcon from '@mui/icons-material/Description';
import TuneIcon from '@mui/icons-material/Tune';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

import App from './App';
import ThemeContextProvider from './shared/contexts/ThemeContext';
import './style.css';

const NAVIGATION_BASE = [
  { segment: 'home', title: 'Home', icon: <HomeIcon /> },
  { segment: 'systems', title: 'Systems', icon: <PeopleIcon /> },
  { segment: 'birthdays', title: 'Birthdays', icon: <CakeIcon /> },
  { segment: 'family-tree', title: 'Family Tree', icon: <AccountTreeIcon /> },
  { segment: 'user-settings', title: 'User Settings', icon: <TuneIcon /> },
  { segment: 'licenses', title: 'Licenses', icon: <DescriptionIcon /> },
];

export const NavigationContext = React.createContext<{
  main: { segment: string; title: string; icon: React.ReactElement }[];
  footer: { segment: string; title: string; icon: React.ReactElement }[];
}>({ main: [], footer: [] });

function InnerApp(): React.ReactElement {
  const { user } = useAuth();

  const navigation = React.useMemo(() => {
    let nav = [...NAVIGATION_BASE];
    // If nobody is signed in, return empty navigation (sidebar should be hidden via auth routes)
    if (!user) {
      return { main: [], footer: [] };
    }
    if (user && (user as any).is_admin) {
      // insert admin before licenses for visibility
      const licensesIdx = nav.findIndex((i) => i.segment === 'licenses');
      if (licensesIdx >= 0) {
        nav = [...nav.slice(0, licensesIdx), { segment: 'admin', title: 'Admin', icon: <AdminPanelSettingsIcon /> }, ...nav.slice(licensesIdx)];
      }
    }
    // For DID-system users, expose a quick link to their system which redirects
    if (user && (user as any).is_system) {
      // insert 'My system' after home
      const idx = nav.findIndex((i) => i.segment === 'home');
      const insertAt = idx >= 0 ? idx + 1 : 0;
      nav = [...nav.slice(0, insertAt), { segment: 'redirect-to-system', title: 'My system', icon: <PeopleIcon /> }, ...nav.slice(insertAt)];
    }
    // hide login when user is signed in
    nav = nav.filter((item) => item.segment !== 'login');
    
    // Separate main navigation from footer items
    const footerItems = nav.filter((item) => item.segment === 'licenses' || item.segment === 'user-settings');
    const mainItems = nav.filter((item) => item.segment !== 'licenses' && item.segment !== 'user-settings');
    
    return { main: mainItems, footer: footerItems };
  }, [user]);

  return (
    <NavigationContext.Provider value={navigation}>
      <App />
    </NavigationContext.Provider>
  );
}

function AppWithProviders(): React.ReactElement {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeContextProvider>
          <SettingsProvider>
            <InnerApp />
          </SettingsProvider>
        </ThemeContextProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppWithProviders />
  </React.StrictMode>,
);
