import React, { useCallback, useEffect, useState } from 'react';
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
import { apiClient } from '@didhub/api-client';
import type { UploadRecord } from '../../shared/types/api';

interface UploadListPayload {
  items?: unknown;
  total?: unknown;
  limit?: unknown;
  offset?: unknown;
}

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseUploadRecord = (value: unknown): UploadRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = toNumberOrNull(record.id);
  const storedName = record.stored_name;
  if (!Number.isFinite(id) || !isNonEmptyString(storedName)) return null;
  return {
    id,
    stored_name: storedName,
    hash: typeof record.hash === 'string' ? record.hash : null,
    user_id: toNumberOrNull(record.user_id),
    mime:
      typeof record.mime === 'string' ? record.mime : typeof record.mime_type === 'string' ? record.mime_type : null,
    bytes: toNumberOrNull(record.bytes),
    created_at: typeof record.created_at === 'string' ? record.created_at : null,
    deleted_at: typeof record.deleted_at === 'string' ? record.deleted_at : null,
    original_name: typeof record.original_name === 'string' ? record.original_name : null,
  };
};

const parseUploadList = (
  payload: UploadListPayload | UploadRecord[] | null,
): {
  items: UploadRecord[];
  total: number;
  limit: number;
  offset: number;
} => {
  if (!payload) {
    return { items: [], total: 0, limit: 0, offset: 0 };
  }

  const source = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];
  const items = source.map(parseUploadRecord).filter((item): item is UploadRecord => Boolean(item));
  const total =
    typeof (payload as UploadListPayload).total === 'number' ? (payload as UploadListPayload).total : items.length;
  const limit =
    typeof (payload as UploadListPayload).limit === 'number' ? (payload as UploadListPayload).limit : items.length;
  const offset = typeof (payload as UploadListPayload).offset === 'number' ? (payload as UploadListPayload).offset : 0;
  return { items, total, limit, offset };
};

const parseSettingValue = (value: unknown): number | null => {
  if (!value || typeof value !== 'object') return null;
  const setting = value as { value?: unknown };
  const raw = setting.value;
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export default function AdminUploads() {
  const [items, setItems] = useState<UploadRecord[]>([]);
  const [limitLocal, setLimitLocal] = useState(50);
  const [offsetLocal, setOffsetLocal] = useState(0);
  const [total, setTotal] = useState(0);
  const [mime, setMime] = useState('');
  const [hash, setHash] = useState('');
  const [userId, setUserId] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [purgeCutoff, setPurgeCutoff] = useState('');
  const [purgeForce, setPurgeForce] = useState(false);
  const [purging, setPurging] = useState(false);
  const [usernames, setUsernames] = useState<Record<number, string>>({});
  const [confirmForceOpen, setConfirmForceOpen] = useState(false);
  const [confirmPurgeOpen, setConfirmPurgeOpen] = useState(false);
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [copyHash, setCopyHash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string | number | boolean> = { limit: limitLocal, offset: offsetLocal };
    if (mime) params.mime = mime;
    if (hash) params.hash = hash;
    if (userId) params.user_id = userId;
    if (includeDeleted) params.include_deleted = true;

    try {
      const response = await apiClient.files.list(params).catch(() => null);
      const { items: fetchedItems, total: fetchedTotal } = parseUploadList(
        response as UploadListPayload | UploadRecord[] | null,
      );
      setItems(fetchedItems);
      setSelected([]);
      setTotal(fetchedTotal);

      const uniqueUserIds = new Set<number>();
      fetchedItems.forEach((item) => {
        if (typeof item.user_id === 'number' && Number.isFinite(item.user_id)) {
          uniqueUserIds.add(item.user_id);
        }
      });
      const missing = Array.from(uniqueUserIds).filter((id) => !(id in usernames));
      if (missing.length) {
        const fetchedUsernames: Record<number, string> = {};
        await Promise.all(
          missing.map(async (id) => {
            try {
              const user = await apiClient.users.get(id);
              if (user && user.username) {
                fetchedUsernames[id] = user.username;
              }
            } catch {
              /* ignore */
            }
          }),
        );
        if (Object.keys(fetchedUsernames).length) {
          setUsernames((prev) => ({ ...prev, ...fetchedUsernames }));
        }
      }

      if (retentionDays === null) {
        try {
          const setting = await apiClient.admin.settings_by_key('uploads.delete.retention.days');
          const parsed = parseSettingValue(setting);
          setRetentionDays(parsed ?? 0);
        } catch {
          setRetentionDays(0);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [hash, includeDeleted, limitLocal, mime, offsetLocal, retentionDays, userId, usernames]);

  const allChecked = items.length > 0 && selected.length === items.length;
  const someChecked = selected.length > 0 && selected.length < items.length;

  const toggleAll = useCallback(() => {
    setSelected((prev) => (allChecked ? [] : items.map((item) => item.stored_name)));
  }, [allChecked, items]);

  const toggleOne = useCallback((name: string) => {
    setSelected((prev) => (prev.includes(name) ? prev.filter((value) => value !== name) : [...prev, name]));
  }, []);

  const deleteRow = useCallback(
    async (name: string, force: boolean) => {
      setDeleting(`${name}${force ? ':force' : ':soft'}`);
      try {
        await apiClient.files.delete(name, force);
        await load();
      } catch {
        /* ignore */
      } finally {
        setDeleting(null);
      }
    },
    [load],
  );

  const bulkDelete = useCallback(
    async (force: boolean) => {
      if (!selected.length) return;
      setBulkDeleting(true);
      try {
        const names = [...selected];
        const concurrency = 5;
        let idx = 0;
        const worker = async () => {
          while (idx < names.length) {
            const current = names[idx++];
            try {
              await apiClient.files.delete(current, force);
            } catch {
              /* ignore */
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, () => worker()));
        await load();
      } finally {
        setBulkDeleting(false);
      }
    },
    [load, selected],
  );

  const doPurge = useCallback(async () => {
    setPurging(true);
    try {
      const purgeBefore = purgeCutoff ? new Date(purgeCutoff).toISOString() : undefined;
      await apiClient.files.purge({ purgeBefore, force: purgeForce });
      await load();
    } finally {
      setPurging(false);
    }
  }, [load, purgeCutoff, purgeForce]);

  const openForceBulk = useCallback(() => {
    if (selected.length) setConfirmForceOpen(true);
  }, [selected.length]);

  const confirmForceBulk = useCallback(() => {
    setConfirmForceOpen(false);
    void bulkDelete(true);
  }, [bulkDelete]);

  const openPurgeConfirm = useCallback(() => {
    setConfirmPurgeOpen(true);
  }, []);

  const confirmPurge = useCallback(() => {
    setConfirmPurgeOpen(false);
    void doPurge();
  }, [doPurge]);

  const cancelDialogs = useCallback(() => {
    setConfirmForceOpen(false);
    setConfirmPurgeOpen(false);
  }, []);

  const ageInfo = useCallback(
    (row: UploadRecord): string => {
      if (!row.deleted_at) return '';
      try {
        const deletedAt = new Date(row.deleted_at).getTime();
        const now = Date.now();
        const diffMs = now - deletedAt;
        const days = Math.floor(diffMs / 86400000);
        let eta = '';
        if (retentionDays !== null) {
          const purgeAt = deletedAt + retentionDays * 86400000;
          const remMs = purgeAt - now;
          if (remMs > 0) {
            const remDays = Math.ceil(remMs / 86400000);
            eta = ` (purges in ~${remDays}d)`;
          } else {
            eta = ' (eligible for purge)';
          }
        }
        return `${days}d ago${eta}`;
      } catch {
        return '';
      }
    },
    [retentionDays],
  );

  const copyToClipboard = useCallback(async (val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopyHash(val);
      window.setTimeout(() => setCopyHash((existing) => (existing === val ? null : existing)), 1500);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadsPage = Math.floor(offsetLocal / limitLocal) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limitLocal));
  function changePage(_: React.ChangeEvent<unknown>, p: number) {
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
