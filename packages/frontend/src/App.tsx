import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { CssBaseline, AppBar, Toolbar, IconButton, Typography, Drawer, List, ListItem, ListItemButton, ListItemText, ListItemIcon, Box, useTheme, useMediaQuery } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useContext, useState } from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';

import ErrorBoundary from './components/ErrorBoundary';
import ToolbarActions from './components/ToolbarActions';
import PasswordChangeDialog from './components/PasswordChangeDialog';
import AppRoutes from './components/AppRoutes';
import { ThemeToggleContext } from './ThemeContext';
import { useAuth } from './contexts/AuthContext';
import { usePasswordChange } from './hooks/usePasswordChange';
import { useNavigationRestrictions } from './hooks/useNavigationRestrictions';
import { NavigationContext } from './main';

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
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(!isMobile);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const navigation = useContext(NavigationContext);

  const passwordChange = usePasswordChange({ changePassword });
  const navigationRestrictions = useNavigationRestrictions({ mustChange });

  // Define auth routes where sidebar should be hidden
  const authRoutes = ['/login', '/register', '/awaiting-approval'];
  const isAuthRoute = authRoutes.includes(location.pathname);

  function closeMenu() {
    setAnchorEl(null);
  }

  async function doLogout() {
    closeMenu();
    await logout();
    navigate('/');
  }

  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen);
  };

  const handleNavigation = (segment: string) => {
    if (segment === 'home') {
      navigate('/');
    } else {
      navigate(`/${segment}`);
    }
    if (isMobile) {
      setDrawerOpen(false);
    }
  };

  // Handle navigation restrictions
  if (navigationRestrictions.shouldRedirect) {
    return <Navigate to={navigationRestrictions.redirectTo} replace />;
  }

  const drawerWidth = 240;

  return (
    <Box>
      <CssBaseline />
      
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: isAuthRoute ? '100%' : (drawerOpen ? `calc(100% - ${drawerWidth}px)` : '100%') },
          ml: { md: isAuthRoute ? 0 : (drawerOpen ? `${drawerWidth}px` : 0) },
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar>
          {!isAuthRoute && (
            <IconButton
              color="inherit"
              aria-label="toggle drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            <img src="/favicon-32x32.png" alt="DIDHub" style={{ height: 28, verticalAlign: 'middle', marginRight: 8 }} />
            DIDHub
          </Typography>
          {!isAuthRoute && (
            <>
              <ToolbarActions mode={mode} toggle={toggle} />
              <IconButton
                color="inherit"
                onClick={(e) => setAnchorEl(e.currentTarget)}
                sx={{ ml: 1 }}
              >
                <img 
                  src={me?.avatar ? `/uploads/${me.avatar}` : '/favicon-32x32.png'} 
                  alt="Account" 
                  style={{ width: 32, height: 32, borderRadius: '50%' }} 
                />
              </IconButton>
            </>
          )}
        </Toolbar>
      </AppBar>

      {/* Navigation Drawer */}
      {!isAuthRoute && (
        <Drawer
          variant={isMobile ? 'temporary' : 'persistent'}
          anchor="left"
          open={drawerOpen}
          onClose={handleDrawerToggle}
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              top: 'auto',
              display: 'flex',
              flexDirection: 'column',
              transition: theme.transitions.create('transform', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
              }),
            },
          }}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
        >
          <Toolbar />
          <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
            <List>
              {navigation.main.map((item) => (
                <ListItem key={item.segment} disablePadding>
                  <ListItemButton onClick={() => handleNavigation(item.segment)}>
                    <ListItemIcon>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText primary={item.title} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
          {navigation.footer.length > 0 && (
            <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
              <List>
                {navigation.footer.map((item) => (
                  <ListItem key={item.segment} disablePadding>
                    <ListItemButton onClick={() => handleNavigation(item.segment)}>
                      <ListItemIcon>
                        {item.icon}
                      </ListItemIcon>
                      <ListItemText primary={item.title} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </Drawer>
      )}

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: isAuthRoute ? '100%' : (drawerOpen ? `calc(100% - ${drawerWidth}px)` : '100%') },
          ml: { md: isAuthRoute ? 0 : (drawerOpen ? `${drawerWidth}px` : 0) },
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar />
        <ErrorBoundary>
          {!isAuthRoute && (
            <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={closeMenu}>
              <MenuItem onClick={doLogout}>Logout</MenuItem>
            </Menu>
          )}

          <AppRoutes user={me} />

          {!isAuthRoute && (
            <PasswordChangeDialog
              open={!!mustChange}
              currentPassword={passwordChange.currentPassword}
              setCurrentPassword={passwordChange.setCurrentPassword}
              newPassword={passwordChange.newPassword}
              setNewPassword={passwordChange.setNewPassword}
              error={passwordChange.error}
              onChange={passwordChange.handleChange}
            />
          )}
        </ErrorBoundary>
      </Box>
    </Box>
  );
}
