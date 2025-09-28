import { useNavigate, Navigate } from 'react-router-dom';
import { CssBaseline } from '@mui/material';
import { useContext, useState } from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { Account } from '@toolpad/core';
import { DashboardLayout } from '@toolpad/core';

import ErrorBoundary from './components/ErrorBoundary';
import ToolbarActions from './components/ToolbarActions';
import AccountPopoverContent from './components/AccountPopoverContent';
import PasswordChangeDialog from './components/PasswordChangeDialog';
import AppRoutes from './components/AppRoutes';
import { ThemeToggleContext } from './ThemeContext';
import { useAuth } from './contexts/AuthContext';
import { usePasswordChange } from './hooks/usePasswordChange';
import { useNavigationRestrictions } from './hooks/useNavigationRestrictions';

/**
 * Main application component that provides the overall layout and routing.
 *
 * This component handles:
 * - Theme management (light/dark mode)
 * - User authentication state
 * - Navigation and routing
 * - Password change requirements
 * - Main dashboard layout with toolbar and account menu
 *
 * @returns The main application JSX element
 */
export default function App() {
  const { mode, toggle } = useContext(ThemeToggleContext);
  const { mustChange, changePassword, user: me, logout } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const passwordChange = usePasswordChange({ changePassword });
  const navigationRestrictions = useNavigationRestrictions({ mustChange });

  function closeMenu() {
    setAnchorEl(null);
  }

  async function doLogout() {
    closeMenu();
    await logout();
    navigate('/');
  }

  // Handle navigation restrictions
  if (navigationRestrictions.shouldRedirect) {
    return <Navigate to={navigationRestrictions.redirectTo} replace />;
  }

  return (
    <DashboardLayout
      defaultSidebarCollapsed={true}
      slots={{
        toolbarActions: () => <ToolbarActions mode={mode} toggle={toggle} />,
        toolbarAccount: Account
      }}
      slotProps={{
        toolbarAccount: {
          slots: { popoverContent: AccountPopoverContent },
          slotProps: { preview: { variant: 'expanded' } },
        },
      }}
    >
      <ErrorBoundary>
        <CssBaseline />
        <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={closeMenu}>
          <MenuItem
            onClick={() => {
              closeMenu();
              navigate('/user-settings');
            }}
          >
            User settings
          </MenuItem>
          <MenuItem onClick={doLogout}>Logout</MenuItem>
        </Menu>

        <AppRoutes user={me} />

        <PasswordChangeDialog
          open={!!mustChange}
          currentPassword={passwordChange.currentPassword}
          setCurrentPassword={passwordChange.setCurrentPassword}
          newPassword={passwordChange.newPassword}
          setNewPassword={passwordChange.setNewPassword}
          error={passwordChange.error}
          onChange={passwordChange.handleChange}
        />
      </ErrorBoundary>
    </DashboardLayout>
  );
}
