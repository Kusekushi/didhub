import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Chip,
  Box,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  People as PeopleIcon,
  Storage as StorageIcon,
  Assignment as AssignmentIcon,
  Security as SecurityIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { apiClient, type ApiAuditLogResponse, type ApiSystemRequestAdminResponse } from '@didhub/api-client';
import NotificationSnackbar, { SnackbarMessage } from '../../components/ui/NotificationSnackbar';

type SystemRequest = ApiSystemRequestAdminResponse;

type AuditLog = ApiAuditLogResponse;

interface SystemHealth {
  redis: {
    ok: boolean;
    mode: string;
    error?: string;
  };
  database: boolean;
}

interface DashboardStats {
  totalUsers: number;
  approvedUsers: number;
  pendingUsers: number;
  totalSystems: number;
  totalUploads: number;
  pendingRequests: number;
}

export default function DashboardTab() {
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    approvedUsers: 0,
    pendingUsers: 0,
    totalSystems: 0,
    totalUploads: 0,
    pendingRequests: 0,
  });
  const [recentRequests, setRecentRequests] = useState<SystemRequest[]>([]);
  const [recentAudit, setRecentAudit] = useState<AuditLog[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    redis: { ok: false, mode: 'unknown' },
    database: false,
  });
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load user statistics
      const [allUsersRes, approvedUsersRes, pendingUsersRes] = await Promise.all([
        apiClient.admin.get_users({ perPage: 1 }), // Just get total
        apiClient.admin.get_users({ perPage: 1, is_approved: true }),
        apiClient.admin.get_users({ perPage: 1, is_approved: false }),
      ]);

      // Load system statistics (systems are users with is_system=true)
  const systems = (await apiClient.admin.get_users({ perPage: 1, is_system: true })).data;

      // Load pending system requests
      const requests = (await apiClient.admin.get_system_requests()).data;

      // Load recent system requests (last 5)
  const recentReqs = requests.slice(-5);

      // Load recent audit logs
  const audit = (await apiClient.admin.get_audit({ perPage: 10 })).data;

      // Load system health
      const redisStatus = (await apiClient.admin.get_admin_redis()).data;

      setStats({
        totalUsers: allUsersRes.data.meta?.total ?? 0,
        approvedUsers: approvedUsersRes.data.meta?.total ?? 0,
        pendingUsers: pendingUsersRes.data.meta?.total ?? 0,
        totalSystems: systems.meta?.total ?? 0,
        totalUploads: 0, // TODO: Add uploads API
        pendingRequests: requests.filter((r: any) => r.status === 'pending').length,
      });

  setRecentRequests(recentReqs);
  setRecentAudit(audit ?? []);
      setSystemHealth({
        redis: redisStatus,
        database: true, // Assume DB is ok if we got this far
      });

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setSnack({ open: true, message: 'Failed to load dashboard data', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'success';
      case 'rejected': return 'error';
      case 'pending': return 'warning';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Typography variant="h5" gutterBottom>
        System Overview
      </Typography>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <PeopleIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Users</Typography>
              </Box>
              <Typography variant="h4">{stats.totalUsers}</Typography>
              <Typography variant="body2" color="text.secondary">
                {stats.approvedUsers} approved, {stats.pendingUsers} pending
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <SecurityIcon color="secondary" sx={{ mr: 1 }} />
                <Typography variant="h6">Systems</Typography>
              </Box>
              <Typography variant="h4">{stats.totalSystems}</Typography>
              <Typography variant="body2" color="text.secondary">
                Active systems
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <StorageIcon color="info" sx={{ mr: 1 }} />
                <Typography variant="h6">Uploads</Typography>
              </Box>
              <Typography variant="h4">{stats.totalUploads}</Typography>
              <Typography variant="body2" color="text.secondary">
                Total files uploaded
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <AssignmentIcon color="warning" sx={{ mr: 1 }} />
                <Typography variant="h6">Requests</Typography>
              </Box>
              <Typography variant="h4">{stats.pendingRequests}</Typography>
              <Typography variant="body2" color="text.secondary">
                Pending system requests
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* System Health */}
      <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
        System Health
      </Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Alert
            icon={systemHealth.redis.ok ? <CheckCircleIcon /> : <ErrorIcon />}
            severity={systemHealth.redis.ok ? 'success' : 'warning'}
          >
            Redis: {systemHealth.redis.ok ? 'Connected' : 'Disconnected'} ({systemHealth.redis.mode})
          </Alert>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Alert
            icon={<CheckCircleIcon />}
            severity="success"
          >
            Database: Connected
          </Alert>
        </Grid>
      </Grid>

      {/* Recent Activity */}
      <Grid container spacing={3}>
        {/* Recent System Requests */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Recent System Requests
            </Typography>
            <List>
              {recentRequests.length === 0 ? (
                <ListItem>
                  <ListItemText primary="No recent requests" />
                </ListItem>
              ) : (
                recentRequests.map((request) => (
                  <ListItem key={request.id} sx={{ px: 0 }}>
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="body1">{request.username}</Typography>
                          <Chip
                            label={request.status}
                            size="small"
                            color={getStatusColor(request.status)}
                          />
                        </Box>
                      }
                      secondary={new Date(request.created_at).toLocaleDateString()}
                    />
                  </ListItem>
                ))
              )}
            </List>
          </Paper>
        </Grid>

        {/* Recent Audit Activity */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Recent Audit Activity
            </Typography>
            <List>
              {recentAudit.length === 0 ? (
                <ListItem>
                  <ListItemText primary="No recent activity" />
                </ListItem>
              ) : (
                recentAudit.map((log) => (
                  <ListItem key={log.id} sx={{ px: 0 }}>
                    <ListItemText
                      primary={
                        <Typography variant="body2">
                          {log.action} {log.entity_type && `on ${log.entity_type}`}
                        </Typography>
                      }
                      secondary={
                        log.created_at
                          ? new Date(log.created_at).toLocaleString()
                          : 'Unknown time'
                      }
                    />
                  </ListItem>
                ))
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>

      <NotificationSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      />
    </>
  );
}
