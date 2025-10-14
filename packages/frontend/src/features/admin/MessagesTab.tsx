import React, { useState, useEffect } from 'react';
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
import * as adminService from '../../services/adminService';
import NotificationSnackbar, { SnackbarMessage } from '../../components/ui/NotificationSnackbar';
import { downloadJson, downloadText } from '../../shared/utils/downloadUtils';

export interface Post {
  id: string;
  type: string;
  created_at: string;
  payload: any;
  count: number;
}

export default function MessagesTab() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });
  const [customDigestOpen, setCustomDigestOpen] = useState(false);
  const [customDaysAhead, setCustomDaysAhead] = useState(7);

  useEffect(() => {
    const loadPosts = async () => {
      try {
        const p = await adminService.posts(page, 20);
        const postItems = p && Array.isArray((p as any).items) ? (p as any).items : [];
        setPosts(postItems as Post[]);
      } catch (error) {
        console.error('Failed to load posts:', error);
      }
    };

    loadPosts();
  }, [page]);
  async function postBirthdays() {
    try {
      setStatus('Posting...');
      const result = await adminService.postDiscordBirthdays();
      const posted = result && (result.status >= 200 && result.status < 400) || Boolean(result && (result.posted ?? result.reposted ?? false));
      const message = (result && (result.error ?? result.message)) ?? (posted ? 'Posted birthdays digest' : 'Nothing to post');
      if (posted) {
        setStatus('Posted birthdays digest');
        setSnack({ open: true, message: 'Posted birthdays digest', severity: 'success' });
      } else {
        setStatus(message);
        setSnack({ open: true, message: message, severity: 'error' });
      }
    } catch (error) {
      setStatus('Failed to post birthdays');
      setSnack({ open: true, message: 'Failed to post birthdays', severity: 'error' });
    } finally {
      setTimeout(() => setStatus(''), 4000);
    }
  }

  async function postCustomDigestHandler() {
    try {
      setStatus('Posting custom digest...');
      setCustomDigestOpen(false);
      const r = await adminService.postCustomDigest(customDaysAhead);
      if (r && (r.posted || r.count)) {
        setStatus(`Posted custom digest with ${r.count} birthdays`);
        setSnack({ open: true, message: `Posted custom digest with ${r.count} birthdays`, severity: 'success' });
      } else {
        const message = r && r.message ? r.message : 'Failed to post custom digest';
        setStatus(message);
        setSnack({ open: true, message: message, severity: 'error' });
      }
    } catch (error) {
      setStatus('Failed to post custom digest');
      setSnack({ open: true, message: 'Failed to post custom digest', severity: 'error' });
    } finally {
      setTimeout(() => setStatus(''), 4000);
    }
  }

  async function doRepost(id: string) {
    try {
      setStatus('Reposting...');
      const r = await adminService.repostPost(id);
      if (r && (r.reposted || r.posted)) {
        setStatus('Reposted');
        setSnack({ open: true, message: 'Post reposted successfully', severity: 'success' });
      } else {
        const message = r && r.error ? String(r.error) : 'Failed to repost';
        setStatus(message);
        setSnack({ open: true, message: message, severity: 'error' });
      }
    } catch (error) {
      setStatus('Failed to repost');
      setSnack({ open: true, message: 'Failed to repost post', severity: 'error' });
    } finally {
      setTimeout(() => setStatus(''), 2000);
    }
  }

  function downloadPayload(p: Post) {
    try {
      const payload = typeof p.payload === 'string' ? JSON.parse(p.payload) : p.payload || {};
      downloadJson(payload, `post-${p.id}`);
    } catch (e) {
      // fallback: copy raw string
      const txt = typeof p.payload === 'string' ? p.payload : JSON.stringify(p.payload || {}, null, 2);
      downloadText(txt, `post-${p.id}`);
    }
  }

  async function copyPayload(p: Post) {
    const txt = typeof p.payload === 'string' ? p.payload : JSON.stringify(p.payload || {}, null, 2);
    try {
      await navigator.clipboard.writeText(txt);
      setStatus('Copied payload');
      setSnack({ open: true, message: 'Payload copied to clipboard', severity: 'success' });
    } catch (e) {
      setStatus('Copy failed');
      setSnack({ open: true, message: 'Failed to copy payload', severity: 'error' });
    } finally {
      setTimeout(() => setStatus(''), 2000);
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
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {posts.length === 0 && <Typography>No posted messages yet.</Typography>}
      {posts
        .filter((p) => {
          if (!query) return true;
          const s = (typeof p.payload === 'string' ? p.payload : JSON.stringify(p.payload || {})).toLowerCase();
          return (
            (p.type || '').toLowerCase().includes(query.toLowerCase()) ||
            (p.created_at || '').toLowerCase().includes(query.toLowerCase()) ||
            s.includes(query.toLowerCase())
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
        <Button variant="outlined" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          Prev
        </Button>
        <Typography>Page {page}</Typography>
        <Button variant="outlined" onClick={() => setPage((p) => p + 1)}>
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
      <NotificationSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      />
    </>
  );
}
