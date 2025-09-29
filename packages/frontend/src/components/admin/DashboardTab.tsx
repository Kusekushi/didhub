import React from 'react';
import { Paper, Typography, List, ListItem, ListItemText, Button } from '@mui/material';

export interface AdminPost {
  id: number;
  type: string;
  created_at: string;
}

export interface DashboardTabProps {
  pendingRegsCount: number;
  posts: AdminPost[];
  onRepost: (postId: number) => void;
}

export default function DashboardTab(props: DashboardTabProps) {
  return (
    <>
      <Paper sx={{ mb: 2, p: 2 }}>
        <Typography variant="subtitle1">
          Pending registrations:{' '}
          <Typography component="span" sx={{ fontWeight: 'bold' }}>
            {props.pendingRegsCount}
          </Typography>
        </Typography>
      </Paper>
      <Typography variant="h6">Recent admin posts</Typography>
      <List>
        {props.posts.map((p) => (
          <ListItem
            key={p.id}
            sx={{ border: '1px solid #eee', mb: 1, borderRadius: 1 }}
            secondaryAction={
              <Button variant="outlined" size="small" onClick={() => props.onRepost(p.id)}>
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
