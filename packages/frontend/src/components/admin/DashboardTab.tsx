import React, { useState, useEffect } from 'react';
import { Paper, Typography, List, ListItem, ListItemText, Button } from '@mui/material';
import { apiClient } from '@didhub/api-client';
import NotificationSnackbar, { SnackbarMessage } from '../NotificationSnackbar';

export interface AdminPost {
  id: number;
  type: string;
  created_at: string;
}

export default function DashboardTab() {
  const [pendingRegsCount, setPendingRegsCount] = useState(0);
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load pending registrations count
        const pageResult = await apiClient.users.list({ page: 1, perPage: 100, is_approved: false });
        setPendingRegsCount(pageResult.total ?? 0);

        // Load recent posts
        const p = await apiClient.admin.posts(1, 10);
        const postItems = p && typeof p === 'object' && !Array.isArray(p) && Array.isArray((p as { items?: unknown[] }).items)
          ? ((p as { items?: unknown[] }).items as unknown[])
          : [];
        setPosts(postItems as AdminPost[]);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      }
    };

    loadData();
  }, []);

  const handleRepost = async (postId: number) => {
    try {
      const r = await apiClient.admin.repostPost(postId);
      if (r && r.reposted) {
        setSnack({ open: true, message: 'Post reposted successfully', severity: 'success' });
      } else {
        setSnack({ open: true, message: r && r.error ? String(r.error) : 'Failed to repost', severity: 'error' });
      }
    } catch (error) {
      setSnack({ open: true, message: 'Failed to repost post', severity: 'error' });
    }
  };

  return (
    <>
      <Paper sx={{ mb: 2, p: 2 }}>
        <Typography variant="subtitle1">
          Pending registrations:{' '}
          <Typography component="span" sx={{ fontWeight: 'bold' }}>
            {pendingRegsCount}
          </Typography>
        </Typography>
      </Paper>
      <Typography variant="h6">Recent admin posts</Typography>
      <List>
        {posts.map((p) => (
          <ListItem
            key={p.id}
            sx={{ border: '1px solid #eee', mb: 1, borderRadius: 1 }}
            secondaryAction={
              <Button variant="outlined" size="small" onClick={() => handleRepost(p.id)}>
                Repost
              </Button>
            }
          >
            <ListItemText primary={p.type} secondary={p.created_at} />
          </ListItem>
        ))}
      </List>
      <NotificationSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      />
    </>
  );
}
