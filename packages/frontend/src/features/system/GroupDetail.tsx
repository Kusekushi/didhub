import React, { useCallback, useEffect, useMemo, useState } from 'react';
import uniqBy from 'lodash-es/uniqBy';
import { useParams, useNavigate } from 'react-router-dom';

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
import { getGroupById, updateGroup, getMembers } from '../../services/groupService';
import { getAlterById as serviceGetAlterById } from '../../services/alterService';
import { uploadFile } from '../../services/fileService';

import logger from '../../shared/lib/logger';
import { useAuth } from '../../shared/contexts/AuthContext';
import { normalizeEntityId } from '../../shared/utils/alterFormUtils';
import NotificationSnackbar, { SnackbarMessage } from '../../components/ui/NotificationSnackbar';
import { usePdf } from '../../shared/hooks/usePdf';
import { ApiAlter, ApiGroupOut, EntityId } from '@didhub/api-client';

type LeaderOption = { id: string; name?: string | null } & Partial<Record<string, any>>;

// ...existing code...
async function getAlterById(id: string | number): Promise<ApiAlter | null> {
  try {
    return await serviceGetAlterById(id as any);
  } catch (error) {
    logger.warn('failed to fetch alter', id, error);
    return null;
  }
}

function normalizeStringId(value: unknown): string | undefined {
  return normalizeEntityId(value) ?? undefined;
}

function extractLeaderIds(group: ApiGroupOut | null): string[] {
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
      } catch { }
    }
    return trimmed
      .split(',')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }
  return [];
}

function extractOwnerId(group: ApiGroupOut | null): string | undefined {
  if (!group) return undefined;
  const candidate = (group as unknown as { owner_user_id?: unknown }).owner_user_id;
  if (typeof candidate === 'string') {
    const t = candidate.trim();
    return t ? t : undefined;
  }
  if (candidate && typeof candidate === 'object' && 'id' in (candidate as Record<string, unknown>)) {
    const idv = (candidate as { id?: unknown }).id;
    if (typeof idv === 'string') {
      const t = idv.trim();
      return t ? t : undefined;
    }
  }
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
      } catch { }
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

function dedupeAltersById(alters: ApiAlter[]): ApiAlter[] {
  // Use uniqBy to deduplicate by normalized id (fallback to original object if id missing)
  return uniqBy(alters, (a) => normalizeStringId(a?.id) ?? JSON.stringify(a));
}

export interface GroupDetailProps {
  groupId?: string;
}

export default function GroupDetail(props: GroupDetailProps = {}) {
  const params = useParams() as { id?: string };
  const id = props.groupId ?? params.id;
  const nav = useNavigate();
  const [group, setGroup] = useState<ApiGroupOut | null>(null);
  const [members, setMembers] = useState<ApiAlter[]>([]);
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
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'error' });
  const [invalidIdsQueue, setInvalidIdsQueue] = useState<string[]>([]);
  const [leaderQuery, setLeaderQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { pdfError, pdfSnackOpen, handlePdfDownload, closePdfSnack } = usePdf();

  useEffect(() => {
    if (invalidIdsQueue.length === 0) return;
    const id = invalidIdsQueue[0];
    setSnack({ open: true, message: `Invalid member id: ${id}`, severity: 'warning' });
    // clear the queue after notifying
    setInvalidIdsQueue([]);
  }, [invalidIdsQueue]);

  const fetchMemberAlters = useCallback(
    async (groupId: EntityId, ensureAlterIds: string[] = []): Promise<ApiAlter[]> => {
      try {
        const membersResp: any = await getMembers(groupId);
        const response: any = membersResp ?? { alters: [] };
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
        const alters = await Promise.all(Array.from(collectedIds).map(async (alterId) => getAlterById(alterId)));
        const valid = alters.filter((alter): alter is ApiAlter => Boolean(alter && alter.id != null));
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
        const groupData = (await getGroupById(id)) as ApiGroupOut | null;
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
      (me.is_system &&
        groupOwnerId != null &&
        me.id != null &&
        normalizeEntityId(me.id) === normalizeEntityId(groupOwnerId))),
  );

  // Normalized leader ids (string form for comparisons) with null guard
  const leaderIds = useMemo(() => extractLeaderIds(group), [group]);

  const uniqueMembers = useMemo(() => dedupeAltersById(members), [members]);

  const leaderMembers = useMemo(() => {
    const leadersSet = new Set(leaderIds);
    const leaders: ApiAlter[] = [];
    uniqueMembers.forEach((member) => {
      const id = getNormalizedIdFor(member);
      if (id && leadersSet.has(id)) leaders.push(member);
    });
    leaders.sort((a, b) =>
      String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' }),
    );
    return leaders;
  }, [leaderIds, uniqueMembers]);
  function getNormalizedIdFor(alter: ApiAlter | null | undefined) {
    if (!alter) return undefined;
    return normalizeEntityId(alter.id) ?? undefined;
  }

  const renderAlterChip = (m: ApiAlter, extra?: { variant?: 'outlined' | 'filled'; color?: 'primary' | 'default' }) => {
    const key = getNormalizedIdFor(m);
    if (!key) {
      // queue invalid id for later notification
      setInvalidIdsQueue((q) => (q.includes(String(m.id)) ? q : [...q, String(m.id)]));
      return null;
    }
    return (
      <Chip
        key={key}
        component="a"
        href={`/detail/alter/${key}`}
        clickable
        avatar={<Avatar alt={m.name}>{(m.name || '#').slice(0, 1)}</Avatar>}
        label={m.name || `#${key}`}
        sx={{ mr: 1, mb: 1 }}
        variant={extra?.variant || 'outlined'}
        color={extra?.color || 'default'}
      />
    );
  };

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
        .map((leader) => normalizeStringId(leader.id))
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
      const payload: Record<string, unknown> = {
        name: editName.trim() ? editName.trim() : null,
        description: editDesc ? editDesc : null,
        leaders: leaderIdsPayload,
        sigil: editSigilUrl || null,
      };
      await updateGroup(group.id, payload as any);
      const updated = (await getGroupById(group.id)) as ApiGroupOut | null;
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
      const formData = new FormData();
      formData.append('file', file);
      const remote = await uploadFile(file).catch(() => undefined);
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

  const exportPdf = useCallback(() => {
    if (group?.id) {
      const gid = normalizeEntityId(group.id);
      if (gid) handlePdfDownload(gid, 'group');
    }
  }, [group?.id, handlePdfDownload]);
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
          {uniqueMembers.map((m) => {
            const nid = normalizeEntityId(m.id);
            return nid
              ? renderAlterChip(m, {
                color: leaderIds.includes(nid) ? 'primary' : 'default',
                variant: leaderIds.includes(nid) ? 'filled' : 'outlined',
              })
              : null;
          })}
        </Box>
      ) : (
        <Typography variant="body2" color="text.disabled" sx={{ mb: 4 }}>
          No members in this group yet
        </Typography>
      )}
      <NotificationSnackbar open={pdfSnackOpen} onClose={closePdfSnack} message={pdfError} severity={'error'} />
      <NotificationSnackbar
        open={snack.open}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        message={snack.message}
        severity={snack.severity}
      />
    </Container>
  );
}
