import React from 'react';
import {
  Box,
  Typography,
  TextField,
  FormControlLabel,
  Checkbox,
  Button,
  Switch,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Pagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { getUser, getSetting, listUploads, deleteUpload, purgeUploads } from '@didhub/api-client';

export default function AdminUploads() {
  // Inlined from AdminUploads.tsx with local state name adjustments to avoid collisions
  const [items, setItems] = React.useState<any[]>([]);
  const [limitLocal, setLimitLocal] = React.useState(50);
  const [offsetLocal, setOffsetLocal] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [mime, setMime] = React.useState('');
  const [hash, setHash] = React.useState('');
  const [userId, setUserId] = React.useState('');
  const [includeDeleted, setIncludeDeleted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [purgeCutoff, setPurgeCutoff] = React.useState('');
  const [purgeForce, setPurgeForce] = React.useState(false);
  const [purging, setPurging] = React.useState(false);
  const [usernames, setUsernames] = React.useState<Record<number, string>>({});
  const [confirmForceOpen, setConfirmForceOpen] = React.useState(false);
  const [confirmPurgeOpen, setConfirmPurgeOpen] = React.useState(false);
  const [retentionDays, setRetentionDays] = React.useState<number | null>(null);
  const [copyHash, setCopyHash] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    const params: Record<string, any> = { limit: limitLocal, offset: offsetLocal };
    if (mime) params.mime = mime;
    if (hash) params.hash = hash;
    if (userId) params.user_id = userId;
    if (includeDeleted) params.include_deleted = 'true';
    const data: any = await listUploads(params).catch(() => null);
    if (data) {
      setItems(data.items || []);
      setSelected([]);
      setTotal(data.total || 0);
      const uids = Array.from(new Set((data.items || []).map((r: any) => r.user_id).filter((v: any) => v)));
      const missing = uids.filter((id: number) => !(id in usernames));
      if (missing.length) {
        const fetched: Record<number, string> = {};
        await Promise.all(
          missing.map(async (id: number) => {
            try {
              const j = await getUser(id as any);
              if (j && (j as any).username) fetched[id] = (j as any).username;
            } catch (e) {}
          }),
        );
        if (Object.keys(fetched).length) setUsernames((prev) => ({ ...prev, ...fetched }));
      }
      if (retentionDays === null) {
        try {
          const rs: any = await getSetting('uploads.delete.retention.days');
          if (rs) {
            const v = rs && rs.value ? parseInt(rs.value, 10) : NaN;
            if (!isNaN(v)) setRetentionDays(v);
            else setRetentionDays(0);
          }
        } catch (e) {
          setRetentionDays(0);
        }
      }
    }
    setLoading(false);
  }

  const allChecked = items.length > 0 && selected.length === items.length;
  const someChecked = selected.length > 0 && selected.length < items.length;
  function toggleAll() {
    if (allChecked) setSelected([]);
    else setSelected(items.map((i) => i.stored_name));
  }
  function toggleOne(name: string) {
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));
  }
  async function deleteRow(name: string, force: boolean) {
    setDeleting(name + (force ? ':force' : ':soft'));
    try {
      const res: any = await deleteUpload(name, force).catch(() => null);
      if (res && res.status < 400) {
        await load();
      }
    } finally {
      setDeleting(null);
    }
  }
  async function bulkDelete(force: boolean) {
    if (!selected.length) return;
    setBulkDeleting(true);
    try {
      const names = [...selected];
      const concurrency = 5;
      let idx = 0;
      async function worker() {
        while (idx < names.length) {
          const my = names[idx++];
          try {
            await deleteUpload(my, force).catch(() => null);
          } catch (e) {}
        }
      }
      const workers = Array.from({ length: Math.min(concurrency, names.length) }, () => worker());
      await Promise.all(workers);
      await load();
    } finally {
      setBulkDeleting(false);
    }
  }
  async function doPurge() {
    setPurging(true);
    try {
      const params = new URLSearchParams();
      if (purgeCutoff) {
        const iso = new Date(purgeCutoff).toISOString();
        params.set('purge_before', iso);
      }
      if (purgeForce) params.set('force', '1');
      await purgeUploads({ purge_before: params.get('purge_before') || undefined, force: purgeForce });
      await load();
    } finally {
      setPurging(false);
    }
  }
  function openForceBulk() {
    if (selected.length) setConfirmForceOpen(true);
  }
  function confirmForceBulk() {
    setConfirmForceOpen(false);
    bulkDelete(true);
  }
  function openPurgeConfirm() {
    setConfirmPurgeOpen(true);
  }
  function confirmPurge() {
    setConfirmPurgeOpen(false);
    doPurge();
  }
  function cancelDialogs() {
    setConfirmForceOpen(false);
    setConfirmPurgeOpen(false);
  }
  function ageInfo(row: any) {
    if (!row.deleted_at) return '';
    try {
      const del = new Date(row.deleted_at).getTime();
      const now = Date.now();
      const diffMs = now - del;
      const days = Math.floor(diffMs / 86400000);
      let eta = '';
      if (retentionDays !== null) {
        const purgeAt = del + retentionDays * 86400000;
        const remMs = purgeAt - now;
        if (remMs > 0) {
          const remDays = Math.ceil(remMs / 86400000);
          eta = ` (purges in ~${remDays}d)`;
        } else eta = ' (eligible for purge)';
      }
      return `${days}d ago${eta}`;
    } catch (e) {
      return '';
    }
  }
  async function copyToClipboard(val: string) {
    try {
      await navigator.clipboard.writeText(val);
      setCopyHash(val);
      setTimeout(() => setCopyHash((h) => (h === val ? null : h)), 1500);
    } catch (e) {}
  }

  React.useEffect(() => {
    load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [limitLocal, offsetLocal, includeDeleted]);

  const uploadsPage = Math.floor(offsetLocal / limitLocal) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limitLocal));
  function changePage(_: any, p: number) {
    setOffsetLocal((p - 1) * limitLocal);
  }

  return (
    <Box p={2}>
      <Typography variant="h5" gutterBottom>
        Uploads (Admin)
      </Typography>
      <Box display="flex" gap={2} mb={2} flexWrap="wrap">
        <TextField label="MIME" value={mime} size="small" onChange={(e) => setMime(e.target.value)} />
        <TextField label="Hash" value={hash} size="small" onChange={(e) => setHash(e.target.value)} />
        <TextField label="User ID" value={userId} size="small" onChange={(e) => setUserId(e.target.value)} />
        <FormControlLabel
          control={<Checkbox checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />}
          label="Include Deleted"
        />
        <Button
          variant="contained"
          disabled={loading}
          onClick={() => {
            setOffsetLocal(0);
            load();
          }}
        >
          Filter
        </Button>
        <Button
          variant="outlined"
          color="warning"
          disabled={!selected.length || bulkDeleting}
          onClick={() => bulkDelete(false)}
        >
          Soft delete selected ({selected.length})
        </Button>
        <Button variant="outlined" color="error" disabled={!selected.length || bulkDeleting} onClick={openForceBulk}>
          Force delete selected
        </Button>
      </Box>
      <Box display="flex" gap={2} alignItems="center" mb={2} flexWrap="wrap">
        <TextField
          type="datetime-local"
          label="Purge cutoff"
          size="small"
          variant="outlined"
          value={purgeCutoff}
          onChange={(e) => setPurgeCutoff(e.target.value)}
          helperText="Local time; converted to UTC ISO"
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ minWidth: 260 }}
        />
        <FormControlLabel
          control={<Switch checked={purgeForce} onChange={(e) => setPurgeForce(e.target.checked)} />}
          label="Force remove files"
        />
        <Button variant="contained" color="error" disabled={purging} onClick={openPurgeConfirm}>
          {purging ? 'Purging...' : 'Run Purge'}
        </Button>
      </Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Checkbox size="small" indeterminate={someChecked} checked={allChecked} onChange={toggleAll} />
            </TableCell>
            <TableCell>ID</TableCell>
            <TableCell>Stored Name</TableCell>
            <TableCell>Hash</TableCell>
            <TableCell>User</TableCell>
            <TableCell>MIME</TableCell>
            <TableCell>Bytes</TableCell>
            <TableCell>Created</TableCell>
            <TableCell>Deleted</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((r) => {
            const checked = selected.includes(r.stored_name);
            const fileUrl = `/uploads/${encodeURIComponent(r.stored_name)}`;
            return (
              <TableRow key={r.id} style={r.deleted_at ? { opacity: 0.5 } : undefined} selected={checked}>
                <TableCell padding="checkbox">
                  <Checkbox size="small" checked={checked} onChange={() => toggleOne(r.stored_name)} />
                </TableCell>
                <TableCell>{r.id}</TableCell>
                <TableCell>
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                    {r.stored_name}
                  </a>
                </TableCell>
                <TableCell style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {r.hash && (
                    <Tooltip title={<span style={{ fontSize: 12, wordBreak: 'break-all' }}>{r.hash}</span>} arrow>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {r.hash.slice(0, 16)}
                        <IconButton
                          size="small"
                          onClick={() => copyToClipboard(r.hash!)}
                          color={copyHash === r.hash ? 'success' : 'default'}
                        >
                          {copyHash === r.hash ? (
                            <CheckIcon fontSize="inherit" />
                          ) : (
                            <ContentCopyIcon fontSize="inherit" />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>{r.user_id ? usernames[r.user_id] || r.user_id : ''}</TableCell>
                <TableCell>{r.mime ?? ''}</TableCell>
                <TableCell>{r.bytes ?? ''}</TableCell>
                <TableCell>{r.created_at?.replace('T', ' ').replace('Z', '') || ''}</TableCell>
                <TableCell>
                  {r.deleted_at ? r.deleted_at.replace('T', ' ').replace('Z', '') : ''}{' '}
                  {r.deleted_at && <span style={{ color: '#888', fontSize: 11 }}>{ageInfo(r)}</span>}
                </TableCell>
                <TableCell style={{ whiteSpace: 'nowrap' }}>
                  {!r.deleted_at && (
                    <Tooltip title="Soft delete">
                      <span>
                        <IconButton size="small" disabled={!!deleting} onClick={() => deleteRow(r.stored_name, false)}>
                          <DeleteIcon fontSize="inherit" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                  <Tooltip title={r.deleted_at ? 'Force delete immediately' : 'Force delete (hard)'}>
                    <span>
                      <IconButton size="small" disabled={!!deleting} onClick={() => deleteRow(r.stored_name, true)}>
                        <DeleteForeverIcon fontSize="inherit" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
          {!items.length && !loading && (
            <TableRow>
              <TableCell colSpan={10} style={{ textAlign: 'center' }}>
                No uploads
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <Box mt={2} display="flex" alignItems="center" gap={2}>
        <Pagination page={uploadsPage} count={pageCount} onChange={changePage} size="small" />
        <TextField
          label="Limit"
          size="small"
          style={{ width: 90 }}
          value={limitLocal}
          onChange={(e) => {
            const v = parseInt(e.target.value || '0', 10);
            if (!isNaN(v) && v > 0 && v <= 500) setLimitLocal(v);
          }}
        />
        <Typography variant="caption">Total: {total}</Typography>
      </Box>
      <Dialog open={confirmForceOpen} onClose={cancelDialogs} maxWidth="xs" fullWidth>
        <DialogTitle>Force delete selected uploads?</DialogTitle>
        <DialogContent>
          This will permanently remove {selected.length} upload{selected.length !== 1 && 's'}. Continue?
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelDialogs}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmForceBulk}>
            Force Delete
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={confirmPurgeOpen} onClose={cancelDialogs} maxWidth="xs" fullWidth>
        <DialogTitle>Run purge job?</DialogTitle>
        <DialogContent>
          This will purge soft-deleted uploads older than the cutoff
          {purgeCutoff && ` (${new Date(purgeCutoff).toISOString()})`}. {purgeForce && 'Files will also be removed.'}
          {retentionDays !== null && (
            <Typography variant="body2" mt={2}>
              Current retention: {retentionDays} day{retentionDays === 1 ? '' : 's'} (uploads deleted more than this age
              are eligible)
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelDialogs}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmPurge}>
            Run Purge
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
