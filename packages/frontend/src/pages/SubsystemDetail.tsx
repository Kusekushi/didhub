import { useEffect, useState } from 'react';
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

import NotificationSnackbar from '../components/NotificationSnackbar';
import { apiClient, parseRoles } from '@didhub/api-client';
import type { Alter, Subsystem, User, AlterName, SubsystemMember } from '@didhub/api-client';

type AlterMember = Alter & { roles?: string[] };

export default function SubsystemDetail() {
  const { uid, sid } = useParams() as { uid?: string; sid?: string };
  const nav = useNavigate();
  const [subsystem, setSubsystem] = useState<Subsystem | null>(null);
  const [members, setMembers] = useState<AlterMember[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const subsystemOwnerSource = (subsystem as Record<string, unknown> | null)?.owner_user_id;
  const subsystemOwnerId =
    typeof subsystemOwnerSource === 'number' || typeof subsystemOwnerSource === 'string'
      ? subsystemOwnerSource
      : subsystemOwnerSource != null
        ? (() => {
            const text = String(subsystemOwnerSource).trim();
            return text ? text : undefined;
          })()
        : undefined;
  const canEdit = Boolean(
    me &&
      subsystem &&
      subsystemOwnerId != null &&
      (me.is_admin || (me.id != null && Number(me.id) === Number(subsystemOwnerId))),
  );
  // Member editing state
  const [memberBusy, setMemberBusy] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [alterOptions, setAlterOptions] = useState<AlterName[]>([]);
  const [alterSearch, setAlterSearch] = useState('');
  const [selectedAlter, setSelectedAlter] = useState<AlterName | null>(null);
  const [newMemberRole, setNewMemberRole] = useState('Member');
  const [roleInputMap, setRoleInputMap] = useState<Record<string, string>>({});
  const [loadingAlterNames, setLoadingAlterNames] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfSnackOpen, setPdfSnackOpen] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        if (!sid) {
          setSubsystem(null);
          setMembers([]);
          return;
        }
        // fetch user first
        try {
          const muser = await apiClient.users.sessionIfAuthenticated();
          setMe(muser);
        } catch {
          setMe(null);
        }
        const subsystemData = await apiClient.subsystems.get(sid);
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
        const results = await (ownerId != null
          ? apiClient.alters.namesByUser(ownerId, alterSearch || '')
          : apiClient.alters.names(alterSearch || ''));
        if (!active) return;
        const items = Array.isArray((results as { items?: AlterName[] }).items)
          ? ((results as { items?: AlterName[] }).items as AlterName[])
          : Array.isArray(results)
            ? (results as AlterName[])
            : [];
        const filtered = items.filter((item): item is AlterName => Boolean(item && item.name));
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

  async function refreshMembers() {
    if (!sid) return;
    try {
      const membershipRows = await apiClient.subsystems.listMembers(sid);
      const byId: Record<string, { alterId: number; roles: string[] }> = {};
      membershipRows.forEach((row: SubsystemMember) => {
        const alterId = row.alterId;
        if (alterId == null) return;
        const numericId = Number(alterId);
        if (!Number.isFinite(numericId)) return;
        const roles = parseRoles(row.roles);
        byId[String(numericId)] = { alterId: numericId, roles };
      });
      // always also gather alters referencing this subsystem (implicit members)
      try {
        const all = await apiClient.alters.list({ includeRelationships: true, perPage: 1000 });
        const alters = Array.isArray(all.items) ? all.items : [];
        alters
          .filter((al) => String(al.subsystem) === String(sid))
          .forEach((al) => {
            if (al?.id == null) return;
            const numericId = Number(al.id);
            if (!Number.isFinite(numericId)) return;
            const key = String(numericId);
            if (!byId[key]) byId[key] = { alterId: numericId, roles: [] };
          });
      } catch {
        /* ignore implicit errors */
      }
      const detailed = await Promise.all(
        Object.values(byId).map(async ({ alterId, roles }) => {
          try {
            const alter = await apiClient.alters.get(alterId);
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
      const alterId = Number(selectedAlter.id);
      if (!Number.isFinite(alterId)) throw new Error('Invalid alter id');
      await apiClient.subsystems.toggleLeader(sid, alterId, true);
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

  async function removeMember(alterId: number, roles: string[] | undefined) {
    if (!sid || !roles || roles.length === 0) return;
    setMemberBusy(true);
    try {
      for (const _roleName of roles) {
        await apiClient.subsystems.toggleLeader(sid, alterId, false);
        // role param omitted; server will remove leader/role appropriately
      }
      await refreshMembers();
    } catch {
      // ignore
    } finally {
      setMemberBusy(false);
    }
  }

  async function toggleRole(alterId: number, _role: string, add: boolean) {
    void _role;
    if (!sid) return;
    setMemberBusy(true);
    try {
      await apiClient.subsystems.toggleLeader(sid, alterId, add);
      await refreshMembers();
    } catch {
      // ignore
    } finally {
      setMemberBusy(false);
    }
  }

  function onAddCustomRole(alterId: number) {
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
  async function exportPdf() {
    if (!subsystem || subsystem.id == null) {
      setPdfError('Missing subsystem id');
      setPdfSnackOpen(true);
      return;
    }
    try {
      // Get JWT token from localStorage
      const token = localStorage.getItem('didhub_jwt');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const resp = await fetch(`/api/pdf/subsystem/${subsystem.id}`, {
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
      a.download = `subsystem-${subsystem.id}.pdf`;
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
                  await apiClient.subsystems.update(subsystem.id, {
                    name: editName.trim(),
                    description: editDesc || null,
                  });
                  const updated = await apiClient.subsystems.get(subsystem.id);
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
                    (option) => !members.some((member) => member.id != null && String(member.id) === String(option.id)),
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
            const memberId = Number(memberIdRaw);
            if (!Number.isFinite(memberId)) return null;
            const roles = Array.isArray(m.roles) ? m.roles : [];
            const secondary = [m.species || '', roles.length ? `Roles: ${roles.join(', ')}` : '']
              .filter(Boolean)
              .join(' \u2022 ');
            const roleKey = String(memberId);
            return (
              <ListItem key={roleKey} disablePadding>
                <ListItemButton onClick={() => nav(`/detail/${memberId}`)}>
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
      <NotificationSnackbar
        open={pdfSnackOpen}
        onClose={() => setPdfSnackOpen(false)}
        message={pdfError}
        severity={'error'}
      />
    </Container>
  );
}
