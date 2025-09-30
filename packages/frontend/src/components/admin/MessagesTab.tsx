import React from 'react';
import {
  Typography,
  Paper,
  Stack,
  Button,
  TextField,
  Divider,
  Avatar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { apiClient } from '@didhub/api-client';
import type { AlertColor } from '@mui/material';

export interface Post {
  id: string;
  type: string;
  created_at: string;
  payload: any;
  count: number;
}

export interface MessagesTabProps {
  posts: Post[];
  query: string;
  page: number;
  status: string;
  setQuery: (query: string) => void;
  setPage: (page: number | ((prev: number) => number)) => void;
  setStatus: (status: string) => void;
  setAdminMsg: (msg: { open: boolean; text: string; severity: AlertColor }) => void;
}

export default function MessagesTab(props: MessagesTabProps) {
  const [customDigestOpen, setCustomDigestOpen] = React.useState(false);
  const [customDaysAhead, setCustomDaysAhead] = React.useState(7);
  async function postBirthdays() {
    props.setStatus('Posting...');
    const result = await apiClient.admin.postDiscordBirthdays();
    const posted = result.status >= 200 && result.status < 400;
    const message = result.error ?? (posted ? 'Posted birthdays digest' : 'Nothing to post');
    if (posted) props.setStatus('Posted birthdays digest');
    else props.setStatus(message);
    setTimeout(() => props.setStatus(''), 4000);
  }

  async function postCustomDigestHandler() {
    props.setStatus('Posting custom digest...');
    setCustomDigestOpen(false);
    const r = await apiClient.admin.postCustomDigest(customDaysAhead);
    if (r && r.posted) props.setStatus(`Posted custom digest with ${r.count} birthdays`);
    else props.setStatus(r && r.message ? r.message : 'Failed to post custom digest');
    setTimeout(() => props.setStatus(''), 4000);
  }

  async function doRepost(id: string) {
    props.setStatus('Reposting...');
    const r = await apiClient.admin.repostPost(id);
    if (r && r.reposted) props.setStatus('Reposted');
    else props.setStatus(r && r.error ? String(r.error) : 'Failed');
    setTimeout(() => props.setStatus(''), 2000);
  }

  function downloadPayload(p: Post) {
    try {
      const payload = typeof p.payload === 'string' ? JSON.parse(p.payload) : p.payload || {};
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `post-${p.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      // fallback: copy raw string
      const txt = typeof p.payload === 'string' ? p.payload : JSON.stringify(p.payload || {}, null, 2);
      const blob = new Blob([txt], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `post-${p.id}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  }

  async function copyPayload(p: Post) {
    const txt = typeof p.payload === 'string' ? p.payload : JSON.stringify(p.payload || {}, null, 2);
    try {
      await navigator.clipboard.writeText(txt);
      props.setStatus('Copied payload');
      setTimeout(() => props.setStatus(''), 2000);
    } catch (e) {
      props.setStatus('Copy failed');
      setTimeout(() => props.setStatus(''), 2000);
    }
  }

  return (
    <>
      <Typography variant="h5" gutterBottom>
        Messages
      </Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
        <Button variant="contained" onClick={postBirthdays}>
          Post birthdays this week
        </Button>
        <Button variant="outlined" onClick={() => setCustomDigestOpen(true)}>
          Custom Digest
        </Button>
        <Typography variant="body2">{status}</Typography>
      </Stack>
      <Divider sx={{ my: 2 }} />
      <Typography variant="h6">Posted messages</Typography>
      <TextField
        placeholder="Search posts..."
        fullWidth
        sx={{ mb: 1 }}
        value={props.query}
        onChange={(e) => props.setQuery(e.target.value)}
      />
      {props.posts.length === 0 && <Typography>No posted messages yet.</Typography>}
      {props.posts
        .filter((p) => {
          if (!props.query) return true;
          const s = (typeof p.payload === 'string' ? p.payload : JSON.stringify(p.payload || {})).toLowerCase();
          return (
            (p.type || '').toLowerCase().includes(props.query.toLowerCase()) ||
            (p.created_at || '').toLowerCase().includes(props.query.toLowerCase()) ||
            s.includes(props.query.toLowerCase())
          );
        })
        .map((p) => {
          const thumbnails = [];
          try {
            const payload = typeof p.payload === 'string' ? JSON.parse(p.payload) : p.payload || {};
            if (payload && Array.isArray(payload.embeds)) {
              for (const e of payload.embeds) {
                if (e && e.thumbnail && e.thumbnail.url) thumbnails.push(e.thumbnail.url);
              }
            }
          } catch (e) {}
          return (
            <Paper key={p.id} sx={{ p: 2, mb: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <div>
                  <Typography variant="subtitle1">
                    <strong>{p.type}</strong>
                  </Typography>
                  <Typography variant="caption">{p.created_at}</Typography>
                </div>
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" onClick={() => doRepost(p.id)}>
                    Repost
                  </Button>
                  <Button variant="outlined" onClick={() => downloadPayload(p)}>
                    Download
                  </Button>
                  <Button variant="outlined" onClick={() => copyPayload(p)}>
                    Copy
                  </Button>
                </Stack>
              </Stack>
              <Typography sx={{ mt: 1 }}>Count: {p.count}</Typography>
              {thumbnails.length > 0 && (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  {thumbnails.map((t, i) => (
                    <Avatar key={i} variant="square" src={t} sx={{ width: 80, height: 80, border: '1px solid #ccc' }} />
                  ))}
                </Stack>
              )}
              <Accordion sx={{ mt: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>Payload</AccordionSummary>
                <AccordionDetails>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>
                    {typeof p.payload === 'string' ? p.payload : JSON.stringify(p.payload, null, 2)}
                  </pre>
                </AccordionDetails>
              </Accordion>
            </Paper>
          );
        })}
      <Stack direction="row" spacing={2} alignItems="center">
        <Button variant="outlined" onClick={() => props.setPage((p) => Math.max(1, p - 1))} disabled={props.page <= 1}>
          Prev
        </Button>
        <Typography>Page {props.page}</Typography>
        <Button variant="outlined" onClick={() => props.setPage((p) => p + 1)}>
          Next
        </Button>
      </Stack>
      <Dialog open={customDigestOpen} onClose={() => setCustomDigestOpen(false)}>
        <DialogTitle>Post Custom Digest</DialogTitle>
        <DialogContent>
          <TextField
            label="Days ahead"
            type="number"
            value={customDaysAhead}
            onChange={(e) => setCustomDaysAhead(parseInt(e.target.value) || 7)}
            fullWidth
            margin="normal"
            inputProps={{ min: 1, max: 365 }}
            helperText="Number of days to look ahead for upcoming birthdays (1-365)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCustomDigestOpen(false)}>Cancel</Button>
          <Button onClick={postCustomDigestHandler} variant="contained">
            Post Digest
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
