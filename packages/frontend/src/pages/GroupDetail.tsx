import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import logger from '../logger';
import {
  Container,
  Box,
  Button,
  Chip,
  Avatar,
  Typography,
  Divider,
  TextField,
  IconButton,
  CircularProgress,
  Autocomplete,
  Tooltip,
  Snackbar,
  Alert,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import { getGroup, listGroupMembers, getAlter, updateGroup, uploadFile, Alter, Group, User } from '@didhub/api-client';
import { useAuth } from '../contexts/AuthContext';

export default function GroupDetail() {
  const { id } = useParams() as { id?: string };
  const nav = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Alter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user: me } = useAuth() as { user?: User };

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editLeaders, setEditLeaders] = useState<Array<Alter | { id: string | number; name?: string }>>([]);
  const [editSigilUrl, setEditSigilUrl] = useState<string | null>(null);
  const [sigilUploading, setSigilUploading] = useState(false);
  const [sigilDrag, setSigilDrag] = useState(false);
  const [leaderOptions, setLeaderOptions] = useState<Alter[]>([]);
  const [leaderQuery, setLeaderQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfSnackOpen, setPdfSnackOpen] = useState(false);

  const callIfFn = <T extends any[] = any[]>(fn: ((...args: T) => any) | null | undefined, ...args: T) => {
    try {
      if (typeof fn === 'function') return fn(...args);
      logger.warn('callIfFn: skipped non-function', { value: fn, type: typeof fn, stack: new Error().stack });
    } catch (e) {
      logger.warn('callIfFn error', e);
    }
  };

  // Fetch group & members
  useEffect(() => {
    let mounted = true;
    async function fetchGroup() {
      if (!id) return;
      callIfFn(setLoading, true);
      try {
        const g = await getGroup(id);
        if (!mounted) return;
        if (!g) {
          callIfFn(setGroup, null);
          callIfFn(setError, 'Group not found');
          return;
        }
        callIfFn(setGroup, g as Group);
        try {
          const gm = await listGroupMembers(id);
          if (!mounted) return;

          // gm now has format { group_id, alters: [id1, id2, ...] }
          const memberIds = gm && gm.alters ? gm.alters : [];

          // Fetch full alter details for each member ID
          const memberPromises = memberIds.map((alterId: number) =>
            getAlter(alterId)
              .then((alter: any) => alter)
              .catch(() => null),
          );
          const memberAlters = (await Promise.all(memberPromises)).filter(Boolean);

          callIfFn(setMembers, memberAlters);
          try {
            const leadersRaw = g && (g as any).leaders ? (g as any).leaders : null;
            let leaderIds: string[] = [];
            if (Array.isArray(leadersRaw)) leaderIds = leadersRaw.map(String);
            else if (typeof leadersRaw === 'string') {
              try {
                leaderIds = JSON.parse(leadersRaw);
              } catch (e) {
                leaderIds = leadersRaw
                  .split(',')
                  .map((s: string) => s.trim())
                  .filter(Boolean);
              }
            }
            const missing = leaderIds.filter((lid) => !memberAlters.some((m: Alter) => String(m.id) === String(lid)));
            for (const lid of missing) {
              try {
                const a = await getAlter(lid);
                if (a && mounted)
                  callIfFn(setMembers, (prev: Alter[]) => {
                    if (prev.some((x) => String(x.id) === String((a as Alter).id))) return prev;
                    return [...prev, a as Alter];
                  });
              } catch (e) {
                logger.warn('failed to fetch leader alter', lid, e);
              }
            }
          } catch (e) {
            logger.warn('error processing leaders', e);
          }
        } catch (e) {
          logger.warn('error listing group members', e);
          callIfFn(setMembers, []);
        }
      } catch (e) {
        logger.warn('group fetch error', e);
        callIfFn(setGroup, null);
        callIfFn(setError, String(e));
      } finally {
        if (mounted) callIfFn(setLoading, false);
      }
    }
    try {
      fetchGroup().catch((e) => {
        logger.error('fetchGroup rejected', e);
      });
    } catch (e) {
      logger.error('fetchGroup sync error', e as any);
    }
    return () => {
      mounted = false;
    };
  }, [id]);

  // Determine manage permission: admin or system owner (computed later if group present)
  const canManage = !!(
    me &&
    (me.is_admin ||
      (me.is_system && group && (group as any).owner_user_id && String(me.id) === String((group as any).owner_user_id)))
  );

  // Normalized leader ids (string form for comparisons) with null guard
  const leaderIds: string[] = (function () {
    if (!group) return [];
    try {
      const raw = (group as any).leaders;
      if (Array.isArray(raw)) return raw.map((l) => (typeof l === 'object' ? String(l.id) : String(l)));
      if (typeof raw === 'string') {
        const t = raw.trim();
        if (t.startsWith('[')) {
          try {
            const arr = JSON.parse(t);
            if (Array.isArray(arr)) return arr.map(String);
          } catch {}
        }
        return t
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } catch {}
    return [];
  })();
  const uniqueMembers = members.reduce<Alter[]>((acc, m) => {
    if (!m || m.id == null) return acc;
    if (acc.some((x) => String(x.id) === String(m.id))) return acc;
    acc.push(m);
    return acc;
  }, []);
  const leaderMembers = uniqueMembers.filter((m) => leaderIds.includes(String(m.id)));
  const otherMembers = uniqueMembers.filter((m) => !leaderIds.includes(String(m.id)));
  // Sort alphabetically by name (case-insensitive)
  leaderMembers.sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }),
  );
  otherMembers.sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }),
  );

  const renderAlterChip = (m: Alter, extra?: { variant?: 'outlined' | 'filled'; color?: 'primary' | 'default' }) => (
    <Chip
      key={String(m.id)}
      component="a"
      href={`/detail/${m.id}`}
      clickable
      avatar={<Avatar alt={m.name}>{(m.name || '#').slice(0, 1)}</Avatar>}
      label={m.name || `#${m.id}`}
      sx={{ mr: 1, mb: 1 }}
      variant={extra?.variant || 'outlined'}
      color={extra?.color || 'default'}
    />
  );

  // Initialize edit form when entering edit mode
  function beginEdit() {
    if (!group) return;
    setEditName(group.name || '');
    setEditDesc(group.description || '');
    setEditLeaders(leaderIds.map((id) => members.find((m) => String(m.id) === String(id)) || { id, name: `#${id}` }));
    // Sigil normalization (single or first element)
    const sig = (group as any).sigil as any;
    let first: string | null = null;
    try {
      if (Array.isArray(sig)) first = sig[0] || null;
      else if (typeof sig === 'string') {
        const trimmed = sig.trim();
        if (trimmed.startsWith('[')) {
          const arr = JSON.parse(trimmed);
          if (Array.isArray(arr) && arr.length) first = arr[0];
        } else if (trimmed.includes(','))
          first =
            trimmed
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)[0] || null;
        else if (trimmed) first = trimmed;
      }
    } catch {}
    setEditSigilUrl(first);
    setEditing(true);
    setSaveError(null);
  }

  async function handleSave() {
    if (!group) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (sigilUploading) throw new Error('Please wait for sigil upload to finish');
      const leadersIds = editLeaders.map((l) => (typeof l === 'object' && (l as any).id ? (l as any).id : l)) as any[];
      await updateGroup(
        group.id as any,
        {
          name: editName || null,
          description: editDesc || null,
          leaders: leadersIds,
          sigil: editSigilUrl || null,
        } as any,
      );
      // Refetch updated group
      const g2 = await getGroup(String(group.id));
      if (g2) setGroup(g2 as Group);
      setEditing(false);
    } catch (e: any) {
      setSaveError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditing(false);
    setSaveError(null);
  }

  // Leader search (only while editing)
  useEffect(() => {
    if (!editing || !group) return;
    let mounted = true;
    const t = setTimeout(async () => {
      try {
        // Get group members (affiliated alters) instead of all user alters
        const groupMembersResponse = await listGroupMembers(group.id as string | number);
        const memberIds = groupMembersResponse?.alters || [];

        if (memberIds.length === 0) {
          setLeaderOptions([]);
          return;
        }

        // Fetch details for each member alter
        const memberPromises = memberIds.map((id: number) =>
          getAlter(id)
            .then((alter: any) => alter)
            .catch(() => null),
        );
        const memberAlters = (await Promise.all(memberPromises)).filter(Boolean);

        // Filter by search query if provided
        const filteredAlters = leaderQuery
          ? memberAlters.filter((alter: any) => alter?.name?.toLowerCase().includes(leaderQuery.toLowerCase()))
          : memberAlters;

        if (!mounted) return;
        setLeaderOptions(filteredAlters);
      } catch (e) {
        console.warn('Failed to load leader options:', e);
        if (!mounted) return;
        setLeaderOptions([]);
      }
    }, 250);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [leaderQuery, editing, group]);

  async function handleSigilFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    const localUrl = URL.createObjectURL(file);
    setEditSigilUrl(localUrl); // immediate preview
    setSigilUploading(true);
    try {
      const res = await uploadFile(file);
      const up: any = res;
      const remote = up?.json?.url || up?.url;
      if (remote) setEditSigilUrl(remote);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSigilUploading(false);
    }
  }

  // Early UI states (after hooks to preserve order)
  if (!id) {
    return (
      <Container>
        <Box sx={{ p: 2 }}>No group specified</Box>
      </Container>
    );
  }
  if (loading) {
    return (
      <Container>
        <Box sx={{ p: 2 }}>Loading...</Box>
      </Container>
    );
  }
  if (error) {
    return (
      <Container>
        <Box sx={{ p: 2, color: 'red' }}>Error: {String(error)}</Box>
      </Container>
    );
  }
  if (!group) {
    return (
      <Container>
        <Box sx={{ p: 2 }}>Group not found</Box>
      </Container>
    );
  }

  async function exportPdf() {
    if (!group) return;
    try {
      // Get JWT token from localStorage
      const token = localStorage.getItem('didhub_jwt');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const resp = await fetch(`/api/pdf/group/${group.id}`, {
        credentials: 'include',
        headers,
      });
      if (!resp.ok) {
        setPdfError(`Failed (${resp.status})`);
        setPdfSnackOpen(true);
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `group-${group.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e: any) {
      setPdfError(e?.message || 'Export failed');
      setPdfSnackOpen(true);
    }
  }
  return (
    <Container sx={{ py: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
        <Button size="small" variant="outlined" onClick={() => nav(-1)}>
          Back
        </Button>
        <Box sx={{ flex: 1 }}>
          {editing ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
              <TextField
                label="Name"
                size="small"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                sx={{ maxWidth: 420 }}
              />
              <TextField
                label="Description"
                size="small"
                multiline
                minRows={2}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                sx={{ maxWidth: 640 }}
              />
            </Box>
          ) : (
            <>
              <Typography variant="h4" sx={{ mb: 0.5 }}>
                {group.name || `#${group.id}`}
              </Typography>
              {group.description ? (
                <Typography variant="body2" color="text.secondary">
                  {group.description}
                </Typography>
              ) : null}
            </>
          )}
        </Box>
        <Tooltip title="Export PDF">
          <IconButton size="small" onClick={exportPdf}>
            <PictureAsPdfIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {canManage && !editing && (
          <Tooltip title="Edit group">
            <IconButton size="small" onClick={beginEdit}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {editing && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<SaveIcon fontSize="small" />}
              disabled={saving || sigilUploading}
              onClick={handleSave}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<CancelIcon fontSize="small" />}
              disabled={saving}
              onClick={cancelEdit}
            >
              Cancel
            </Button>
          </Box>
        )}
      </Box>

      {saveError && (
        <Typography variant="body2" color="error" sx={{ mb: 2 }}>
          {saveError}
        </Typography>
      )}

      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Sigil
        </Typography>
        {editing ? (
          <Box>
            <Box
              onDragOver={(e) => {
                e.preventDefault();
                setSigilDrag(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setSigilDrag(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setSigilDrag(false);
                handleSigilFiles(e.dataTransfer.files);
              }}
              sx={{
                border: '1px dashed ' + (sigilDrag ? '#1976d2' : '#999'),
                p: 1.5,
                borderRadius: 2,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 140,
                minHeight: 110,
                position: 'relative',
              }}
            >
              {editSigilUrl ? (
                <Box sx={{ position: 'relative' }}>
                  <img
                    src={editSigilUrl}
                    alt="sigil"
                    style={{
                      maxWidth: 160,
                      maxHeight: 100,
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid #ccc',
                    }}
                  />
                  <IconButton
                    size="small"
                    sx={{ position: 'absolute', top: -10, right: -10, background: '#fff' }}
                    onClick={() => setEditSigilUrl(null)}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              ) : sigilUploading ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={28} />
                  <Typography variant="caption">Uploading…</Typography>
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', fontSize: 12, opacity: 0.8 }}>
                  <div>Drag & drop sigil</div>
                  <div style={{ opacity: 0.6 }}>or click to select</div>
                </Box>
              )}
              <input
                type="file"
                accept="image/*"
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                onChange={(e) => handleSigilFiles(e.target.files)}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              Maximum file size: 20MB
            </Typography>
          </Box>
        ) : editSigilUrl ? (
          <Avatar
            variant="rounded"
            src={/^(https?:|data:|blob:|\/)/i.test(editSigilUrl) ? editSigilUrl : undefined}
            sx={{ width: 72, height: 72 }}
          >
            {!/^(https?:|data:|blob:|\/)/i.test(editSigilUrl || '') ? (editSigilUrl || '?').slice(0, 2) : ''}
          </Avatar>
        ) : (
          <Typography variant="body2" color="text.disabled">
            No sigil
          </Typography>
        )}
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Leaders
        </Typography>
        {editing ? (
          <Autocomplete
            multiple
            options={leaderOptions}
            value={editLeaders as any}
            onChange={(_e, v) => setEditLeaders(v as any)}
            onInputChange={(_e, v) => setLeaderQuery(v)}
            getOptionLabel={(a: any) => (a && typeof a === 'object' ? a.name || `#${a.id}` : String(a))}
            filterSelectedOptions
            renderInput={(params) => <TextField {...params} label="Leaders" size="small" sx={{ maxWidth: 480 }} />}
            sx={{ maxWidth: 520 }}
          />
        ) : leaderMembers.length ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
            {leaderMembers.map((m) => renderAlterChip(m, { color: 'primary' }))}
          </Box>
        ) : (
          <Typography variant="body2" color="text.disabled">
            No leaders listed
          </Typography>
        )}
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6">Members</Typography>
        <Typography variant="caption" color="text.secondary">
          {uniqueMembers.length} total
        </Typography>
      </Box>
      {uniqueMembers.length ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
          {uniqueMembers.map((m) =>
            renderAlterChip(m, {
              color: leaderIds.includes(String(m.id)) ? 'primary' : 'default',
              variant: leaderIds.includes(String(m.id)) ? 'filled' : 'outlined',
            }),
          )}
        </Box>
      ) : (
        <Typography variant="body2" color="text.disabled" sx={{ mb: 4 }}>
          No members in this group yet
        </Typography>
      )}
      <Snackbar
        open={pdfSnackOpen}
        autoHideDuration={4000}
        onClose={() => setPdfSnackOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" onClose={() => setPdfSnackOpen(false)} sx={{ width: '100%' }}>
          {pdfError}
        </Alert>
      </Snackbar>
    </Container>
  );
}
