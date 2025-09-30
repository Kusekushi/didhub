import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import { apiClient, type Alter, type Group, type GroupMembersResponse } from '@didhub/api-client';
import { useAuth } from '../contexts/AuthContext';
import NotificationSnackbar from '../components/NotificationSnackbar';

type LeaderOption = Partial<Alter> & { id: number | string; name?: string | null };

function normalizeStringId(value: unknown): string | undefined {
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  if (value && typeof value === 'object' && 'id' in value) {
    const candidate = (value as { id?: unknown }).id;
    if (typeof candidate === 'number' || typeof candidate === 'string') return String(candidate);
  }
  return undefined;
}

function extractLeaderIds(group: Group | null): string[] {
  if (!group) return [];
  const leaders = (group as { leaders?: unknown }).leaders;
  if (!leaders) return [];
  if (Array.isArray(leaders)) {
    return leaders
      .map((value) => normalizeStringId(value))
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
  }
  if (typeof leaders === 'string') {
    const trimmed = leaders.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((value) => normalizeStringId(value))
            .filter((value): value is string => typeof value === 'string' && value.length > 0);
        }
      } catch {}
    }
    return trimmed
      .split(',')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }
  return [];
}

function extractOwnerId(group: Group | null): number | string | undefined {
  if (!group) return undefined;
  if (group.owner_user_id != null) return group.owner_user_id;
  if (group.ownerUserId != null) return group.ownerUserId;
  const raw = (group as Record<string, unknown>).owner_user_id;
  if (typeof raw === 'number' || typeof raw === 'string') return raw;
  return undefined;
}

function deriveSigilUrl(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const first = parsed.find((value) => typeof value === 'string' && value.trim().length > 0);
          return typeof first === 'string' ? first.trim() : null;
        }
      } catch {}
    }
    if (trimmed.includes(',')) {
      const first = trimmed
        .split(',')
        .map((segment) => segment.trim())
        .find((segment) => segment.length > 0);
      return first ?? null;
    }
    return trimmed;
  }
  if (Array.isArray(raw)) {
    const first = raw.find((value) => typeof value === 'string' && value.trim().length > 0);
    return typeof first === 'string' ? first.trim() : null;
  }
  if (raw && typeof raw === 'object') {
    if ('url' in raw && typeof (raw as Record<string, unknown>).url === 'string') {
      return (raw as Record<string, string>).url;
    }
  }
  return null;
}

function dedupeAltersById(alters: Alter[]): Alter[] {
  const seen = new Set<string>();
  const result: Alter[] = [];
  for (const alter of alters) {
    const id = normalizeStringId(alter?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(alter);
  }
  return result;
}

export default function GroupDetail() {
  const { id } = useParams() as { id?: string };
  const nav = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Alter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user: me } = useAuth();

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editLeaders, setEditLeaders] = useState<LeaderOption[]>([]);
  const [editSigilUrl, setEditSigilUrl] = useState<string | null>(null);
  const [sigilUploading, setSigilUploading] = useState(false);
  const [sigilDrag, setSigilDrag] = useState(false);
  const [leaderOptions, setLeaderOptions] = useState<LeaderOption[]>([]);
  const [leaderQuery, setLeaderQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfSnackOpen, setPdfSnackOpen] = useState(false);

  const fetchMemberAlters = useCallback(
    async (groupId: string | number, ensureAlterIds: string[] = []): Promise<Alter[]> => {
      try {
        const response: GroupMembersResponse = await apiClient.groups.listMembers(groupId);
        const collectedIds = new Set<string>();
        if (Array.isArray(response.alters)) {
          response.alters.forEach((value) => {
            const id = normalizeStringId(value);
            if (id) collectedIds.add(id);
          });
        }
        ensureAlterIds.forEach((value) => {
          if (value) collectedIds.add(value);
        });
        const alters = await Promise.all(
          Array.from(collectedIds).map(async (alterId) => {
            try {
              const alter = await apiClient.alters.get(alterId);
              return alter ?? null;
            } catch (err) {
              logger.warn('failed to fetch alter', alterId, err);
              return null;
            }
          }),
        );
        const valid = alters.filter((alter): alter is Alter => Boolean(alter && alter.id != null));
        return dedupeAltersById(valid);
      } catch (err) {
        logger.warn('error listing group members', err);
        return [];
      }
    },
    [],
  );

  useEffect(() => {
    let mounted = true;

    const loadGroupAndMembers = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const groupData = await apiClient.groups.get(id);
        if (!mounted) return;
        if (!groupData || groupData.id == null) {
          setGroup(null);
          setMembers([]);
          setError('Group not found');
          return;
        }
        setGroup(groupData);
        setError(null);

        const leaders = extractLeaderIds(groupData);
        const alters = await fetchMemberAlters(groupData.id, leaders);
        if (!mounted) return;
        setMembers(alters);
      } catch (err) {
        if (!mounted) return;
        logger.warn('group fetch error', err);
        setGroup(null);
        setMembers([]);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadGroupAndMembers().catch((err) => logger.error('fetchGroup rejected', err));

    return () => {
      mounted = false;
    };
  }, [fetchMemberAlters, id]);

  useEffect(() => {
    if (!group) return;
    setEditSigilUrl((current) => (current != null ? current : deriveSigilUrl(group.sigil)));
  }, [group]);

  // Determine manage permission: admin or system owner (computed later if group present)
  const groupOwnerId = extractOwnerId(group);
  const canManage = Boolean(
    me &&
      (me.is_admin ||
        (me.is_system && groupOwnerId != null && me.id != null && String(me.id) === String(groupOwnerId))),
  );

  // Normalized leader ids (string form for comparisons) with null guard
  const leaderIds = useMemo(() => extractLeaderIds(group), [group]);

  const uniqueMembers = useMemo(() => dedupeAltersById(members), [members]);

  const leaderMembers = useMemo(() => {
    const leadersSet = new Set(leaderIds);
    const leaders: Alter[] = [];
    uniqueMembers.forEach((member) => {
      const id = normalizeStringId(member?.id);
      if (id && leadersSet.has(id)) leaders.push(member);
    });
    leaders.sort((a, b) =>
      String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' }),
    );
    return leaders;
  }, [leaderIds, uniqueMembers]);

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
    setEditName(group.name ?? '');
    setEditDesc(group.description ?? '');
    const leaderSelections = leaderIds
      .map((id) => {
        const existing = members.find((member) => normalizeStringId(member.id) === id);
        if (existing && existing.id != null) return { ...existing, id: existing.id } as LeaderOption;
        return { id, name: `#${id}` } as LeaderOption;
      })
      .filter((option, index, array) => index === array.findIndex((candidate) => candidate.id === option.id));
    setEditLeaders(leaderSelections);
    setEditSigilUrl(deriveSigilUrl(group.sigil));
    setEditing(true);
    setSaveError(null);
  }

  async function handleSave() {
    if (!group || group.id == null) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (sigilUploading) throw new Error('Please wait for sigil upload to finish');
      const leaderIdsPayload = editLeaders
        .map((leader) => leader.id)
        .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number');
      const payload: Record<string, unknown> = {
        name: editName.trim() ? editName.trim() : null,
        description: editDesc ? editDesc : null,
        leaders: leaderIdsPayload,
        sigil: editSigilUrl || null,
      };
      await apiClient.groups.update(group.id, payload);
      const updated = await apiClient.groups.get(group.id);
      setGroup(updated);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
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
    if (!editing || !group || group.id == null) return;
    let mounted = true;
    const timeout = window.setTimeout(async () => {
      const alters = await fetchMemberAlters(group.id);
      if (!mounted) return;
      const query = leaderQuery.trim().toLowerCase();
      const filtered = query ? alters.filter((alter) => alter.name?.toLowerCase().includes(query)) : alters;
      const mapped = filtered
        .map((alter) => (alter.id != null ? ({ ...alter, id: alter.id } as LeaderOption) : null))
        .filter((option): option is LeaderOption => option !== null);
      setLeaderOptions(mapped);
    }, 250);
    return () => {
      mounted = false;
      window.clearTimeout(timeout);
    };
  }, [editing, fetchMemberAlters, group, leaderQuery]);

  async function handleSigilFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    const localUrl = URL.createObjectURL(file);
    setEditSigilUrl(localUrl); // immediate preview
    setSigilUploading(true);
    try {
      const result = await apiClient.files.upload(file);
      const payload = result.payload ?? null;
      const remote =
        result.url ??
        (typeof payload?.url === 'string' ? payload.url : undefined) ??
        (typeof payload?.filename === 'string' ? payload.filename : undefined);
      if (remote) setEditSigilUrl(remote);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setPdfError(message);
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
          <Autocomplete<LeaderOption, true, false, false>
            multiple
            options={leaderOptions}
            value={editLeaders}
            onChange={(_event, value) => setEditLeaders(value)}
            onInputChange={(_e, v) => setLeaderQuery(v)}
            getOptionLabel={(option) => (option.name ? option.name : option.id != null ? `#${option.id}` : '')}
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
      <NotificationSnackbar
        open={pdfSnackOpen}
        onClose={() => setPdfSnackOpen(false)}
        message={pdfError}
        severity={'error'}
      />
    </Container>
  );
}
