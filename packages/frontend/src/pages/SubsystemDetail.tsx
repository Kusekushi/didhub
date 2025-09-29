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
import ShareIcon from '@mui/icons-material/Share';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

import NotificationSnackbar from '../components/NotificationSnackbar';
import { useSettings } from '../contexts/SettingsContext';
import {
  createShortLink,
  getSubsystem,
  listSubsystemMembers,
  getAlter,
  fetchAlters,
  updateSubsystem,
  fetchMeVerified,
  toggleSubsystemLeader,
  fetchAlterNames,
  fetchAlterNamesByUser,
  Alter,
  Subsystem,
} from '@didhub/api-client';

export default function SubsystemDetail() {
  const { uid, sid } = useParams() as { uid?: string; sid?: string };
  const nav = useNavigate();
  const [subsystem, setSubsystem] = useState<Subsystem | null>(null);
  const [members, setMembers] = useState<Array<Alter & { roles?: string[] }>>([]);
  const [me, setMe] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const canEdit = !!(
    me &&
    subsystem &&
    (subsystem as any).owner_user_id != null &&
    (me.is_admin || Number(me.id) === Number((subsystem as any).owner_user_id))
  );
  // Member editing state
  const [memberBusy, setMemberBusy] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [alterOptions, setAlterOptions] = useState<Array<{ id: number | string; name: string }>>([]);
  const [alterSearch, setAlterSearch] = useState('');
  const [selectedAlter, setSelectedAlter] = useState<{ id: number | string; name: string } | null>(null);
  const [newMemberRole, setNewMemberRole] = useState('Member');
  const [roleInputMap, setRoleInputMap] = useState<Record<string | number, string>>({});
  const [loadingAlterNames, setLoadingAlterNames] = useState(false);
  const [shareDialog, setShareDialog] = useState<{ open: boolean; url: string; error: string | null }>({
    open: false,
    url: '',
    error: null,
  });
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfSnackOpen, setPdfSnackOpen] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        // fetch user first
        try {
          const muser = await fetchMeVerified();
          setMe(muser);
        } catch {
          setMe(null);
        }
        const s = await getSubsystem(sid);
        setSubsystem(s || null);
        if (s) {
          setEditName((s as any).name || '');
          setEditDesc((s as any).description || '');
        }
        await refreshMembers(true);
      } catch (e) {
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
        let r;
        // filter by system owner id if available on subsystem
        if (subsystem && (subsystem as any).owner_user_id) {
          r = await fetchAlterNamesByUser((subsystem as any).owner_user_id, alterSearch || '');
        } else {
          r = await fetchAlterNames(alterSearch || '');
        }
        if (!active) return;
        const items = (r && (r as any).items) || [];
        setAlterOptions(items.filter((it: any) => it && it.name));
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

  async function refreshMembers(initial = false) {
    try {
      const m = await listSubsystemMembers(sid);
      const membershipRows = ((m && (m as any).items) || []) as any[];
      // always also gather alters referencing this subsystem (implicit members)
      let implicit: any[] = [];
      try {
        const all = await fetchAlters('', true); // include relationships
        const alters = (all && (all as any).items) || [];
        implicit = alters.filter((al: any) => String(al.subsystem) === String(sid));
      } catch {
        /* ignore implicit errors */
      }
      const byId: Record<string | number, { alter_id: number | string; roles: string[] }> = {};
      membershipRows.forEach((row) => {
        const aid = row.alter_id || row.alterId;
        if (aid != null) byId[aid] = { alter_id: aid, roles: Array.isArray(row.roles) ? row.roles : [] };
      });
      implicit.forEach((al: any) => {
        if (al && al.id != null && !byId[al.id]) byId[al.id] = { alter_id: al.id, roles: [] };
      });
      const merged = Object.values(byId);
      const detailed = await Promise.all(
        merged.map(async (row: any) => {
          const aid = row.alter_id;
          if (aid == null) return null;
          try {
            const a = await getAlter(aid);
            if (a) return { ...(a as Alter), roles: row.roles };
          } catch {
            return null;
          }
          return null;
        }),
      );
      setMembers(detailed.filter(Boolean) as Array<Alter & { roles?: string[] }>);
    } catch {
      setMembers([]);
    }
  }

  async function addMember() {
    if (!selectedAlter) return;
    setMemberBusy(true);
    try {
      if (newMemberRole === 'Host') {
        await toggleSubsystemLeader(sid as string, selectedAlter.id, true);
      } else {
        await toggleSubsystemLeader(sid as string, selectedAlter.id, true);
        // server side handles non-host roles via same endpoint (role param optional)
      }
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

  async function removeMember(alterId: string | number, roles: string[] | undefined) {
    if (!roles || !roles.length) return;
    setMemberBusy(true);
    try {
      for (const roleName of roles) {
        await toggleSubsystemLeader(sid as string, alterId, false);
        // role param omitted; server will remove leader/role appropriately
      }
      await refreshMembers();
    } catch (e) {
      // ignore
    } finally {
      setMemberBusy(false);
    }
  }

  async function toggleRole(alterId: string | number, role: string, add: boolean) {
    setMemberBusy(true);
    try {
      await toggleSubsystemLeader(sid as string, alterId, add);
      await refreshMembers();
    } catch (e) {
      // ignore
    } finally {
      setMemberBusy(false);
    }
  }

  function onAddCustomRole(alterId: string | number) {
    const val = (roleInputMap as any)[alterId];
    const trimmed = (val || '').trim();
    if (!trimmed) return;
    toggleRole(alterId, trimmed, true);
    setRoleInputMap((m) => ({ ...m, [alterId]: '' }));
  }
  if (!subsystem)
    return (
      <Container>
        <Box sx={{ my: 4 }}>
          <Typography>Loading...</Typography>
        </Box>
      </Container>
    );
  const settings = useSettings();
  async function handleShare() {
    if (!settings.loaded) return setShareDialog({ open: true, url: '', error: 'Settings not loaded' });
    if (!settings.shortLinksEnabled) return setShareDialog({ open: true, url: '', error: 'Short links are disabled' });
    const resp = await createShortLink('subsystem', (subsystem as Subsystem).id).catch(() => null);
    if (!resp || (!(resp as any).token && !(resp as any).url))
      return setShareDialog({
        open: true,
        url: '',
        error: resp && (resp as any).error ? String((resp as any).error) : 'Unknown',
      });
    const url = (resp as any).url || `/s/${(resp as any).token}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareDialog({ open: true, url, error: null });
    } catch (e) {
      setShareDialog({ open: true, url, error: null });
    }
  }
  async function exportPdf() {
    if (!subsystem) return;
    try {
      // Get JWT token from localStorage
      const token = localStorage.getItem('didhub_jwt');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const resp = await fetch(`/api/pdf/subsystem/${(subsystem as any).id}`, {
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
      a.download = `subsystem-${(subsystem as any).id}.pdf`;
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
        {!uid && subsystem && (subsystem as any).owner_user_id && (
          <Chip
            component={RouterLink}
            to={`/did-system/${(subsystem as any).owner_user_id}`}
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
          {settings.shortLinksEnabled && (
            <Tooltip title="Create share link and copy to clipboard">
              <IconButton size="small" onClick={handleShare}>
                <ShareIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {!editing && (
          <Typography variant="h4" sx={{ flex: 1 }}>
            {(subsystem as Subsystem).name}
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
                if (!subsystem) return;
                setSaving(true);
                try {
                  const resp = await updateSubsystem((subsystem as any).id, {
                    name: editName.trim(),
                    description: editDesc || null,
                  });
                  if ((resp as any).status === 200 || (resp as any).json) {
                    const updated = await getSubsystem((subsystem as any).id);
                    setSubsystem(updated || null);
                    setEditing(false);
                  }
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
                setEditName((subsystem as any).name || '');
                setEditDesc((subsystem as any).description || '');
              }}
            >
              Cancel
            </Button>
          </>
        )}
      </Box>
      {!editing && <Typography sx={{ mb: 2 }}>{(subsystem as Subsystem).description}</Typography>}
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
                  options={alterOptions.filter((o) => !members.find((m) => String(m.id) === String(o.id)))}
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
            const secondary = [
              m.species || '',
              (m as any).roles && (m as any).roles.length ? `Roles: ${(m as any).roles.join(', ')}` : '',
            ]
              .filter(Boolean)
              .join(' \u2022 ');
            return (
              <ListItem key={m.id} disablePadding>
                <ListItemButton onClick={() => nav(`/detail/${m.id}`)}>
                  <ListItemText primary={m.name || `#${m.id}`} secondary={secondary} />
                </ListItemButton>
                {canEdit && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1, pb: 1 }}>
                    {(m.roles || []).map((r) => (
                      <Chip
                        key={r}
                        size="small"
                        label={r}
                        onDelete={() => toggleRole(m.id as any, r, false)}
                        deleteIcon={<CloseIcon />}
                        color={r === 'Host' ? 'primary' : 'default'}
                        sx={{ mr: 0.5 }}
                      />
                    ))}
                    <TextField
                      size="small"
                      placeholder="Add role"
                      value={roleInputMap[m.id] || ''}
                      onChange={(e) => setRoleInputMap((mp) => ({ ...mp, [m.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          onAddCustomRole(m.id as any);
                        }
                      }}
                      sx={{ width: 140 }}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={memberBusy || !(roleInputMap[m.id] || '').trim()}
                      onClick={() => onAddCustomRole(m.id as any)}
                    >
                      Add Role
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      disabled={memberBusy}
                      onClick={() => removeMember(m.id as any, (m as any).roles || [])}
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
