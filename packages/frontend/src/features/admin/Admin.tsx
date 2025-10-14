import React from 'react';
import { useState } from 'react';
import { Box, List, ListItem, ListItemButton, ListItemText } from '@mui/material';
import {
  Dashboard as DashboardIcon,
  CloudUpload as UploadIcon,
  People as UsersIcon,
  Pending as PendingIcon,
  Assignment as SystemRequestsIcon,
  Settings as SettingsIcon,
  Security as OidcIcon,
  Storage as RedisIcon,
  SystemUpdate as UpdatesIcon,
  Message as MessagesIcon,
  Assessment as AuditIcon,
  CleaningServices as HousekeepingIcon,
  Dataset as DatabaseIcon,
  Analytics as MetricsIcon,
  Backup as BackupIcon,
} from '@mui/icons-material';
import { useMe } from '../../shared/hooks/useMe';
import Housekeeping from './Housekeeping';
import AdminUploads from './AdminUploads';
import AuditTab from './AuditTab';
import BackupRestoreTab from './BackupRestoreTab';
import DashboardTab from './DashboardTab';
import DatabaseTab from './DatabaseTab';
import MessagesTab from './MessagesTab';
import MetricsTab from './MetricsTab';
import OidcProvidersTab from './OidcProvidersTab';
import PendingTab from './PendingTab';
import RedisTab from './RedisTab';
import SettingsTab from './SettingsTab';
import SystemRequestsTab from './SystemRequestsTab';
import SystemUpdates from './SystemUpdates';
import UserListPanel from './UserListPanel';

export default function Admin() {
  const [tab, setTab] = useState(0);
  const { me } = useMe();

  // Early return after all hooks to avoid hook ordering issues
  if (!me || !me.is_admin) return <div style={{ padding: 20 }}>Admin only</div>;

  const tabsDef = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      icon: <DashboardIcon />,
      render: () => <DashboardTab />,
    },
    {
      key: 'uploads',
      label: 'Uploads',
      icon: <UploadIcon />,
      render: () => <AdminUploads />,
    },
    {
      key: 'users',
      label: 'Users',
      icon: <UsersIcon />,
      render: () => <UserListPanel />,
    },
    {
      key: 'pending',
      label: 'Pending',
      icon: <PendingIcon />,
      render: () => <PendingTab />,
    },
    {
      key: 'system',
      label: 'System Requests',
      icon: <SystemRequestsIcon />,
      render: () => <SystemRequestsTab />,
    },
    {
      key: 'settings',
      label: 'Settings',
      icon: <SettingsIcon />,
      render: () => <SettingsTab />,
    },
    {
      key: 'oidc',
      label: 'OIDC Providers',
      icon: <OidcIcon />,
      render: () => <OidcProvidersTab />,
    },
    {
      key: 'redis',
      label: 'Redis',
      icon: <RedisIcon />,
      render: () => <RedisTab />,
    },
    {
      key: 'updates',
      label: 'System Updates',
      icon: <UpdatesIcon />,
      render: () => <SystemUpdates />,
    },
    {
      key: 'messages',
      label: 'Messages',
      icon: <MessagesIcon />,
      render: () => <MessagesTab />,
    },
    {
      key: 'audit',
      label: 'Audit Logs',
      icon: <AuditIcon />,
      render: () => <AuditTab />,
    },
    {
      key: 'housekeeping',
      label: 'Housekeeping',
      icon: <HousekeepingIcon />,
      render: () => <Housekeeping />,
    },
    {
      key: 'database',
      label: 'Database',
      icon: <DatabaseIcon />,
      render: () => <DatabaseTab />,
    },
    {
      key: 'backup-restore',
      label: 'Backup & Restore',
      icon: <BackupIcon />,
      render: () => <BackupRestoreTab />,
    },
    {
      key: 'metrics',
      label: 'Metrics',
      icon: <MetricsIcon />,
      render: () => <MetricsTab />,
    },
  ];

  const panels = tabsDef.map((tdef) => tdef.render || (() => null));

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar */}
      <Box sx={{ width: 280, borderRight: 1, borderColor: 'divider' }}>
        <List>
          {tabsDef.map((tdef, i) => (
            <ListItem key={tdef.key} disablePadding>
              <ListItemButton
                selected={tab === i}
                onClick={() => setTab(i)}
                sx={{
                  '&.Mui-selected': {
                    backgroundColor: 'primary.main',
                    color: 'primary.contrastText',
                    '& .MuiListItemIcon-root': {
                      color: 'primary.contrastText',
                    },
                    '&:hover': {
                      backgroundColor: 'primary.dark',
                    },
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                  {tdef.icon}
                  <ListItemText primary={tdef.label} />
                </Box>
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>

      {/* Main Content */}
      <Box sx={{ flex: 1, padding: 3, overflow: 'auto' }}>{panels[tab] ? panels[tab]() : null}</Box>
    </Box>
  );
}
