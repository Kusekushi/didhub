import { useEffect, useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Stack,
  Chip,
  Tabs,
  Tab,
  Box,
  Button,
  Switch,
  FormControlLabel,
  TextField,
  IconButton,
} from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import { useAuth } from '../contexts/AuthContext';
import { fetchFamilyTree } from '@didhub/api-client';
import * as d3 from 'd3';
import GraphD3 from '../components/GraphD3';
import NodeView from '../components/NodeView';
import { useExpandState } from '../hooks/useExpandState';

interface FamilyNode {
  id: number;
  name?: string;
  partners: number[];
  children: FamilyNode[];
  duplicated?: boolean;
}
interface FamilyTreeResponse {
  roots: FamilyNode[];
  nodes: Record<
    string,
    {
      id: number;
      name?: string;
      partners: number[];
      parents: number[];
      children: number[];
      age?: string;
      system_roles?: string[] | string;
      owner_user_id?: number;
      user_partners?: number[];
      user_parents?: number[];
      user_children?: number[];
    }
  >;
  owners?: Record<string, { id: number; username?: string; is_system?: boolean }>;
  edges: { parent: [number, number][]; partner: [number, number][] };
}

export default function FamilyTree() {
  const [data, setData] = useState<FamilyTreeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [forceLayout, setForceLayout] = useState(false);
  const [colorMode, setColorMode] = useState<'role' | 'owner'>(() => {
    try {
      const v = localStorage.getItem('familyTree.colorMode');
      return v === 'owner' ? 'owner' : 'role';
    } catch {
      return 'role';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('familyTree.colorMode', colorMode);
    } catch {
      // Ignore localStorage errors in some environments
    }
  }, [colorMode]);
  const [search, setSearch] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);
  const { toggle, isCollapsed } = useExpandState(data);

  // Build role color mapping
  const roleColors = useMemo(() => {
    if (!data) return {} as Record<string, string>;
    const roles: string[] = [];
    Object.values(data.nodes).forEach((n) => {
      const r = n.system_roles;
      const arr = Array.isArray(r) ? r : r ? [r] : [];
      arr.forEach((role) => {
        if (role && !roles.includes(role)) roles.push(role);
      });
    });
    if (roles.length === 0) roles.push('Unassigned');
    const palette = (d3 as any).schemeTableau10 || (d3 as any).schemeCategory10 || [];
    const map: Record<string, string> = {};
    roles.forEach((role, i) => {
      if (palette[i]) map[role] = palette[i];
      else map[role] = d3.interpolateRainbow(i / roles.length);
    });
    if (!map['Unassigned']) map['Unassigned'] = '#555';
    return map;
  }, [data]);

  const [customOwnerColors, setCustomOwnerColors] = useState<Record<number, string>>(() => {
    try {
      const raw = localStorage.getItem('familyTree.ownerColors');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('familyTree.ownerColors', JSON.stringify(customOwnerColors));
    } catch {
      // Ignore localStorage errors in some environments
    }
  }, [customOwnerColors]);

  const ownerColors = useMemo(() => {
    if (!data) return {} as Record<number, string>;
    const ownerIds: number[] = [];
    Object.values(data.nodes).forEach((n) => {
      if (n.owner_user_id && !ownerIds.includes(n.owner_user_id)) ownerIds.push(n.owner_user_id);
    });
    ownerIds.sort((a, b) => a - b);
    const palette = (d3 as any).schemeSet3 || (d3 as any).schemeCategory10 || [];
    const map: Record<number, string> = {};
    ownerIds.forEach((oid, i) => {
      map[oid] = customOwnerColors[oid] || palette[i % palette.length] || d3.interpolateSinebow(i / ownerIds.length);
    });
    return map;
  }, [data, customOwnerColors]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchFamilyTree();
        if (!result) throw new Error('Failed to fetch family tree data');
        setData(result as FamilyTreeResponse);
      } catch (e: any) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, reloadNonce]);

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" gutterBottom>
          Family Tree
        </Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="List" />
          <Tab label="Graph" />
        </Tabs>
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Button size="small" variant="outlined" onClick={() => setReloadNonce((n) => n + 1)}>
            Force Reload
          </Button>
          {tab === 1 && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={colorMode === 'owner'}
                  onChange={(e) => setColorMode(e.target.checked ? 'owner' : 'role')}
                />
              }
              label={colorMode === 'owner' ? 'Color: Owner' : 'Color: Role'}
            />
          )}
        </Box>
        {tab === 1 && (
          <FormControlLabel
            control={<Switch checked={forceLayout} onChange={(e) => setForceLayout(e.target.checked)} />}
            label="Force-directed layout"
            sx={{ mb: 2 }}
          />
        )}
        {tab === 1 && (
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
            <TextField
              size="small"
              label="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or id"
            />
            {colorMode === 'role' && (
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ maxWidth: '100%' }}>
                {Object.entries(roleColors).map(([role, color]) => (
                  <Chip key={role} size="small" label={role} sx={{ background: color, color: '#fff' }} />
                ))}
              </Stack>
            )}
            {colorMode === 'owner' && data && (
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ maxWidth: '100%', alignItems: 'center' }}>
                {Object.entries(ownerColors).map(([oidStr, color]) => {
                  const oid = Number(oidStr);
                  const meta = data.owners && data.owners[oidStr];
                  const kind = meta?.is_system ? 'System' : 'User';
                  const label = meta?.username ? `${kind}: ${meta.username}` : `${kind} #${oid}`;
                  return (
                    <Box
                      key={oid}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        border: '1px solid #444',
                        borderRadius: 2,
                        p: 0.5,
                        gap: 0.5,
                      }}
                    >
                      <Chip size="small" label={label} sx={{ background: color, color: '#000', fontWeight: 500 }} />
                      <input
                        type="color"
                        value={color.startsWith('#') ? color : '#' + d3.color(color)?.formatHex().replace('#', '')}
                        onChange={(e) => setCustomOwnerColors((prev) => ({ ...prev, [oid]: e.target.value }))}
                        style={{ width: 32, height: 28, background: 'transparent', border: 'none', cursor: 'pointer' }}
                        title="Pick color"
                      />
                      <IconButton
                        size="small"
                        onClick={() =>
                          setCustomOwnerColors((prev) => {
                            const n = { ...prev };
                            delete n[oid];
                            return n;
                          })
                        }
                      >
                        <PaletteIcon fontSize="inherit" />
                      </IconButton>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Box>
        )}
        {loading && <CircularProgress size={28} />}
        {error && <Typography color="error">{error}</Typography>}
        {!loading && !error && data && tab === 0 && (
          <Stack spacing={2}>
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              Expand / collapse nodes. Nodes with multiple parents appear under each parent and are marked as (ref).
            </Typography>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {data.roots.map((r) => (
                <NodeView key={r.id} node={r} all={data.nodes} toggle={toggle} isCollapsed={isCollapsed} />
              ))}
            </ul>
          </Stack>
        )}
        {!loading && !error && data && tab === 1 && (
          <Box sx={{ overflow: 'auto', maxHeight: '80vh' }}>
            <GraphD3
              data={data}
              forceLayout={forceLayout}
              highlight={search}
              roleColors={roleColors}
              ownerColors={ownerColors}
              colorMode={colorMode}
            />
            <Typography variant="caption" display="block" sx={{ mt: 1, opacity: 0.6 }}>
              Solid lines = parent→child, dashed purple lines = partners. Toggle color mode (Role / System/User) above.
              Colors are editable when in System/User mode.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
