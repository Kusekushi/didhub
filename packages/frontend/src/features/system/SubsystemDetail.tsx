import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  Tooltip,
  IconButton,
  Chip,
  ListItemButton,
  Autocomplete,
  TextField,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/PersonAddAlt1';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
// Prefer UI-facing shared types instead of importing generated-client types.
import type { ApiUser, ApiAlter, ApiSystemDetail as ApiSubsystemOut } from '../../types/ui';
type ApiRoutesAltersNamesItem = any;
type ApiMembersOut = any;

function parseRoles(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((r) => typeof r === 'string') as string[];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.filter((r) => typeof r === 'string') as string[];
      } catch {}
    }
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}
import { getSubsystemById, listSubsystems, getMembers, toggleLeader, updateSubsystem, toggleLeaderRaw } from '../../services/subsystemService';
import { searchAlters, listAlters, getAlterById } from '../../services/alterService';
type Subsystem = ApiSubsystemOut;
type AlterName = ApiRoutesAltersNamesItem;

import NotificationSnackbar, { SnackbarMessage } from '../../components/ui/NotificationSnackbar';
import { usePdf } from '../../shared/hooks/usePdf';
import { useAuth } from '../../shared/contexts/AuthContext';
import { normalizeEntityId, type EntityId } from '../../shared/utils/alterFormUtils';

type AlterRecord = Record<string, any>;
type AlterMember = AlterRecord & { roles?: string[] };

export interface SubsystemDetailProps {
  subsystemId?: string;
  systemUid?: string;
}

export default function SubsystemDetail(props: SubsystemDetailProps = {}) {
  const params = useParams() as { uid?: string; sid?: string };
  const uid = props.systemUid ?? params.uid;
  const sid = props.subsystemId ?? params.sid;
  const nav = useNavigate();
  const [subsystem, setSubsystem] = useState<ApiSubsystemOut | null>(null);
  const [members, setMembers] = useState<AlterMember[]>([]);
  const { user: me } = useAuth() as { user?: ApiUser };
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'error' });
  const [invalidIdsQueue, setInvalidIdsQueue] = useState<string[]>([]);
  const subsystemOwnerSource = subsystem ? (subsystem as any).owner_user_id : undefined;
  const subsystemOwnerId = normalizeEntityId(subsystemOwnerSource) ?? undefined;
  const canEdit = Boolean(
    me &&
      subsystem &&
      subsystemOwnerId != null &&
      (me.is_admin || (me.id != null && normalizeEntityId(me.id) === normalizeEntityId(subsystemOwnerId))),
  );
  // Member editing state
  const [memberBusy, setMemberBusy] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [alterOptions, setAlterOptions] = useState<ApiRoutesAltersNamesItem[]>([]);
  const [alterSearch, setAlterSearch] = useState('');
  const [selectedAlter, setSelectedAlter] = useState<AlterName | null>(null);
  const [newMemberRole, setNewMemberRole] = useState('Member');
  const [roleInputMap, setRoleInputMap] = useState<Record<string, string>>({});
  const [loadingAlterNames, setLoadingAlterNames] = useState(false);
  const { pdfError, pdfSnackOpen, handlePdfDownload, closePdfSnack } = usePdf();
  useEffect(() => {
    (async () => {
      try {
        if (!sid) {
          setSubsystem(null);
          setMembers([]);
          return;
        }
    // fetch subsystem first
    const subsystemData = (await getSubsystemById(sid)) as Subsystem | null;
    setSubsystem(subsystemData ?? null);
        if (subsystemData) {
          setEditName(subsystemData.name ?? '');
          setEditDesc(subsystemData.description ?? '');
        }
        await refreshMembers();
      } catch {
        setSubsystem(null);
        setMembers([]);
      }
    })();
  }, [sid]);

  // Fetch alter options for adding members (debounced simple approach)
  useEffect(() => {
    let active = true;
    (async () => {
      if (!addMemberOpen) return;
      setLoadingAlterNames(true);
      try {
    const ownerId = subsystemOwnerId;
    const nameParams: { q?: string; user_id?: EntityId } = {};
    if (alterSearch) nameParams.q = alterSearch;
    if (ownerId != null) nameParams.user_id = ownerId;
    const response = (await searchAlters(nameParams)) ?? { items: [] };
    const results = Array.isArray(response.items) ? (response.items as ApiRoutesAltersNamesItem[]) : [];
        if (!active) return;
        const filtered = results.filter((item): item is AlterName => Boolean(item && item.name));
        setAlterOptions(filtered);
      } catch (e) {
        if (active) setAlterOptions([]);
      } finally {
        if (active) setLoadingAlterNames(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [alterSearch, addMemberOpen, subsystem]);

  useEffect(() => {
    if (invalidIdsQueue.length === 0) return;
    const id = invalidIdsQueue[0];
    setSnack({ open: true, message: `Invalid member id: ${id}`, severity: 'warning' });
    setInvalidIdsQueue([]);
  }, [invalidIdsQueue]);

  async function refreshMembers() {
    if (!sid) return;
    try {
  const membersResp = (await getMembers(sid)) as ApiMembersOut | null;
  const membersData = (membersResp as ApiMembersOut | undefined) ?? { alters: [] };
      const rawMembers = Array.isArray(membersData.alters) ? membersData.alters : [];
      const membershipRows = rawMembers.map((value) => ({
        alterId: normalizeEntityId(value) ?? undefined,
        alter_id: value,
        roles: [],
      }));
      const byId: Record<string, { alterId: string; roles: string[] }> = {};
      membershipRows.forEach((row: any) => {
        const alterId = row.alterId;
        if (!alterId) return;
        const roles = parseRoles(row.roles);
        const key = String(alterId);
        byId[key] = { alterId: key, roles };
      });
      // always also gather alters referencing this subsystem (implicit members)
      try {
        const listParams: Record<string, unknown> = { limit: 1000 };
        if (uid) {
          const u = normalizeEntityId(uid);
          if (u) listParams.user_id = u;
        }
  const listResponse: any = (await listAlters(listParams)) ?? { items: [] };
  const alters = Array.isArray(listResponse.items) ? (listResponse.items as ApiAlter[]) : [];
        alters
          .filter((al) => normalizeEntityId(al.subsystem) === normalizeEntityId(sid))
          .forEach((al) => {
            if (al?.id == null) return;
            const key = normalizeEntityId(al.id);
            if (!key) return;
            if (!byId[key]) byId[key] = { alterId: key, roles: [] };
          });
      } catch {
        /* ignore implicit errors */
      }
      const detailed = await Promise.all(
        Object.values(byId).map(async ({ alterId, roles }) => {
          try {
            const alter = (await getAlterById(alterId)) as ApiAlter | null;
            if (!alter) return null;
            return { ...alter, roles } as AlterMember;
          } catch {
            return null;
          }
        }),
      );
      const validMembers = detailed.filter((item): item is AlterMember => Boolean(item));
      setMembers(validMembers);
    } catch {
      setMembers([]);
    }
  }

  async function addMember() {
    if (!selectedAlter || !sid) return;
    setMemberBusy(true);
    try {
      const alterId = normalizeEntityId((selectedAlter as any).id);
      if (!alterId) throw new Error('Invalid alter id');
  await toggleLeaderRaw(sid, { alter_id: alterId, add: true });
      // server side handles non-host roles via same endpoint (role param optional)
      await refreshMembers();
      setSelectedAlter(null);
      setNewMemberRole('Member');
      setAddMemberOpen(false);
    } catch {
      /* ignore */
    } finally {
      setMemberBusy(false);
    }
  }

  async function removeMember(alterId: string, roles: string[] | undefined) {
    if (!sid || !roles || roles.length === 0) return;
    setMemberBusy(true);
    try {
      for (const _roleName of roles) {
  await toggleLeaderRaw(sid, { alter_id: String(alterId), add: false });
        // role param omitted; server will remove leader/role appropriately
      }
      await refreshMembers();
    } catch {
      // ignore
    } finally {
      setMemberBusy(false);
    }
  }

  async function toggleRole(alterId: string, _role: string, add: boolean) {
    void _role;
    if (!sid) return;
    setMemberBusy(true);
    try {
  await toggleLeaderRaw(sid, { alter_id: String(alterId), add });
      await refreshMembers();
    } catch {
      // ignore
    } finally {
      setMemberBusy(false);
    }
  }

  function onAddCustomRole(alterId: string) {
    const key = String(alterId);
    const val = roleInputMap[key] ?? '';
    const trimmed = val.trim();
    if (!trimmed) return;
    void toggleRole(alterId, trimmed, true);
    setRoleInputMap((m) => ({ ...m, [key]: '' }));
  }
  if (!subsystem)
    return (
      <Container>
        <Box sx={{ my: 4 }}>
          <Typography>Loading...</Typography>
        </Box>
      </Container>
    );
  const exportPdf = useCallback(() => {
    if (subsystem?.id) {
      const sId = normalizeEntityId(subsystem.id);
      if (sId) handlePdfDownload(sId, 'subsystem');
    }
  }, [subsystem?.id, handlePdfDownload]);
  return (
    <Container>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 2, flexWrap: 'wrap' }}>
        <Button onClick={() => nav(-1)}>← Back</Button>
        {/* Cross-link back to system view if system uid is in route or owner_user_id available */}
        {uid && (
          <Chip
            component={RouterLink}
            to={`/did-system/${uid}`}
            label="View System"
            clickable
            size="small"
            sx={{ ml: 1 }}
          />
        )}
        {!uid && subsystemOwnerId != null && (
          <Chip
            component={RouterLink}
            to={`/did-system/${encodeURIComponent(String(subsystemOwnerId))}`}
            label="View System"
            clickable
            size="small"
            sx={{ ml: 1 }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        <Box>
          <Tooltip title="Export PDF">
            <IconButton size="small" onClick={exportPdf}>
              <PictureAsPdfIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {!editing && (
          <Typography variant="h4" sx={{ flex: 1 }}>
            {subsystem.name}
          </Typography>
        )}
        {editing && (
          <input
            style={{ fontSize: 28, padding: '4px 8px', flex: 1, minWidth: 260 }}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            disabled={saving}
          />
        )}
        {canEdit && !editing && (
          <Button size="small" onClick={() => setEditing(true)}>
            Edit inline
          </Button>
        )}
        {editing && (
          <>
            <Button
              size="small"
              variant="contained"
              disabled={!editName.trim() || saving}
              onClick={async () => {
                if (!subsystem || subsystem.id == null) return;
                setSaving(true);
                try {
                  await updateSubsystem(subsystem.id, { name: editName.trim(), description: editDesc || null } as any);
                  const updated = (await getSubsystemById(subsystem.id)) as Subsystem | null;
                  setSubsystem(updated ?? null);
                  setEditing(false);
                } catch (e) {
                  // optionally show snackbar
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save
            </Button>
            <Button
              size="small"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setEditName(subsystem?.name ?? '');
                setEditDesc(subsystem?.description ?? '');
              }}
            >
              Cancel
            </Button>
          </>
        )}
      </Box>
      {!editing && <Typography sx={{ mb: 2 }}>{subsystem.description}</Typography>}
      {editing && (
        <textarea
          style={{ width: '100%', minHeight: 120, padding: 8, fontFamily: 'inherit', fontSize: 14, marginBottom: 16 }}
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          disabled={saving}
        />
      )}
      <div>
        <Typography variant="h6">Members</Typography>
        {canEdit && (
          <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {!addMemberOpen && (
              <Button size="small" startIcon={<AddIcon />} onClick={() => setAddMemberOpen(true)} disabled={memberBusy}>
                Add member
              </Button>
            )}
            {addMemberOpen && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                <Autocomplete
                  size="small"
                  sx={{ minWidth: 240 }}
                  options={alterOptions.filter(
                    (option) =>
                      !members.some(
                        (member) => member.id != null && normalizeEntityId(member.id) === normalizeEntityId(option.id),
                      ),
                  )}
                  getOptionLabel={(o) => o.name}
                  loading={loadingAlterNames}
                  value={selectedAlter}
                  onChange={(_e, v) => setSelectedAlter(v)}
                  inputValue={alterSearch}
                  onInputChange={(_e, v) => setAlterSearch(v)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Alter"
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {loadingAlterNames ? <CircularProgress color="inherit" size={14} /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                />
                <TextField
                  size="small"
                  label="Initial Role"
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value)}
                  sx={{ width: 160 }}
                />
                <Button
                  size="small"
                  variant="contained"
                  disabled={!selectedAlter || !newMemberRole.trim() || memberBusy}
                  onClick={addMember}
                >
                  Add
                </Button>
                <Button size="small" disabled={memberBusy} onClick={() => setAddMemberOpen(false)}>
                  Cancel
                </Button>
              </Box>
            )}
          </Box>
        )}
        <List>
          {members.length === 0 && (
            <ListItem>
              <ListItemText primary="No members" />
            </ListItem>
          )}
          {members.map((m) => {
            const memberIdRaw = m.id;
            if (memberIdRaw == null) return null;
            const memberId = normalizeEntityId(memberIdRaw);
            if (!memberId) {
              setInvalidIdsQueue((q) => (q.includes(String(memberIdRaw)) ? q : [...q, String(memberIdRaw)]));
              return null;
            }
            const roles = Array.isArray(m.roles) ? m.roles : [];
            const secondary = [m.species || '', roles.length ? `Roles: ${roles.join(', ')}` : '']
              .filter(Boolean)
              .join(' \u2022 ');
            const roleKey = memberId;
            return (
              <ListItem key={roleKey} disablePadding>
                <ListItemButton onClick={() => nav(`/detail/alter/${memberId}`)}>
                  <ListItemText primary={m.name || `#${memberId}`} secondary={secondary} />
                </ListItemButton>
                {canEdit && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1, pb: 1 }}>
                    {roles.map((r) => (
                      <Chip
                        key={r}
                        size="small"
                        label={r}
                        onDelete={() => void toggleRole(memberId, r, false)}
                        deleteIcon={<CloseIcon />}
                        color={r === 'Host' ? 'primary' : 'default'}
                        sx={{ mr: 0.5 }}
                      />
                    ))}
                    <TextField
                      size="small"
                      placeholder="Add role"
                      value={roleInputMap[roleKey] || ''}
                      onChange={(e) => setRoleInputMap((mp) => ({ ...mp, [roleKey]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          onAddCustomRole(memberId);
                        }
                      }}
                      sx={{ width: 140 }}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={memberBusy || !(roleInputMap[roleKey] || '').trim()}
                      onClick={() => onAddCustomRole(memberId)}
                    >
                      Add Role
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      disabled={memberBusy}
                      onClick={() => void removeMember(memberId, roles)}
                    >
                      Remove Member
                    </Button>
                  </Box>
                )}
              </ListItem>
            );
          })}
        </List>
      </div>
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
