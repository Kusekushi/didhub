import React from 'react';
import { Paper, Typography, List, ListItem, ListItemText, Button } from '@mui/material';

interface AdminPost {
  id: number;
  type: string;
  created_at: string;
}

interface DashboardTabProps {
  pendingRegsCount: number;
  posts: AdminPost[];
  onRepost: (postId: number) => void;
}

export default function DashboardTab({ pendingRegsCount, posts, onRepost }: DashboardTabProps) {
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
              <Button variant="outlined" size="small" onClick={() => onRepost(p.id)}>
                Repost
              </Button>
            }
          >
            <ListItemText primary={p.type} secondary={p.created_at} />
          </ListItem>
        ))}
      </List>
    </>
  );
}
