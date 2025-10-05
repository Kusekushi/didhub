import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import PaletteIcon from '@mui/icons-material/Palette';
import type { ReactNode } from 'react';
import FamilyTreeGraph from './components/FamilyTreeGraph';
import NodeView from './components/NodeView';
import FilterDialog from './components/FilterDialog';
import SettingsDialog from './components/SettingsDialog';
import { useTreeFilter } from './hooks/useTreeFilter';
import { useTreeSettings } from './hooks/useTreeSettings';
import { useRoleColors } from './hooks/useRoleColors';
import { useOwnerColors } from './hooks/useOwnerColors';
import { useExpandState } from './hooks/useExpandState';
import { ensureHexColor, getReadableTextColor } from './utils/color';
import type { FamilyTreeResponse } from './types';
import type { ColorModeSetting, LayoutModeSetting } from './utils/treeSettings';

export interface FamilyTreeViewProps {
  refreshKey?: unknown;
  fetchFamilyTree: () => Promise<FamilyTreeResponse | null>;
  onAlterNavigate?: (id: number) => void;
  detailPathBuilder?: (id: number) => string;
  renderAlterLink?: (id: number, label: string) => ReactNode;
  onError?: (error: unknown) => void;
}

export default function FamilyTreeView({
  refreshKey,
  fetchFamilyTree,
  onAlterNavigate,
  detailPathBuilder = (id: number) => `/detail/${id}`,
  renderAlterLink,
  onError,
}: FamilyTreeViewProps) {
  const [data, setData] = useState<FamilyTreeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(1);
  const [search, setSearch] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const treeSettings = useTreeSettings();
  const {
    effectiveData,
    filterActive,
    filterSummary,
    openDialog: openFilterDialog,
    closeDialog: closeFilterDialog,
    isDialogOpen: filterDialogOpen,
    draft: filterDraft,
    alterOptions,
    updateDraft: updateFilterDraft,
    applyDraft: applyFilterDraft,
    clearFilter,
    previewCount: filterPreviewCount,
    layerOptions,
    parseLayerLimit,
  } = useTreeFilter(data);

  const roleColors = useRoleColors(effectiveData);
  const { ownerColors, entries: ownerEntries, setOwnerColor, clearOwnerColor } = useOwnerColors(effectiveData);

  const filteredAlterCount = effectiveData ? Object.keys(effectiveData.nodes).length : 0;
  const { toggle, isCollapsed } = useExpandState(effectiveData);

  const navigate = useNavigate();
  const defaultLinkRenderer = useCallback(
    (alterId: number, label: string) => <RouterLink to={detailPathBuilder(alterId)}>{label}</RouterLink>,
    [detailPathBuilder],
  );
  const linkRenderer = renderAlterLink ?? defaultLinkRenderer;

  const openAlter = useCallback(
    (alterId: number) => {
      if (onAlterNavigate) {
        onAlterNavigate(alterId);
        return;
      }
      navigate(detailPathBuilder(alterId));
    },
    [onAlterNavigate, navigate, detailPathBuilder],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchFamilyTree();
        if (cancelled) return;
        if (!result) throw new Error('Failed to fetch family tree data');
        setData(result);
      } catch (err) {
        if (cancelled) return;
        setError(String(err));
        onError?.(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [fetchFamilyTree, refreshKey, reloadNonce, onError]);

  const filterNotice = filterActive && filterSummary ? `Tree filter: ${filterSummary}` : `Showing ${filteredAlterCount} alters`;
  const highlightedSearch = search.trim();

  const ownerChips = useMemo(
    () =>
      ownerEntries.map((entry) => {
        const colorHex = ensureHexColor(entry.color);
        const textColor = getReadableTextColor(colorHex);
        return (
          <Box
            key={entry.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              p: 0.5,
              gap: 0.5,
            }}
          >
            <Chip size="small" label={entry.label} sx={{ backgroundColor: colorHex, color: textColor, fontWeight: 500 }} />
            <input
              type="color"
              value={colorHex}
              onChange={(event) => setOwnerColor(entry.id, event.target.value)}
              style={{ width: 32, height: 28, background: 'transparent', border: 'none', cursor: 'pointer' }}
              title="Pick color"
            />
            <Button
              size="small"
              variant="text"
              onClick={() => clearOwnerColor(entry.id)}
              startIcon={<PaletteIcon fontSize="small" />}
            >
              Reset
            </Button>
          </Box>
        );
      }),
    [ownerEntries, setOwnerColor, clearOwnerColor],
  );

  const {
    settings,
    lineThemeDescription,
    handleLineThemeSelect,
    handleResetTheme,
    handleBackgroundColorChange,
    handleNodeBorderChange,
    handleEdgeColorChange,
    handleEdgeWidthChange,
    handleEdgeDashChange,
    handleEdgeOpacityChange,
    dashOptions,
    lineThemePresets,
    updateSettings,
  } = treeSettings;

  const handleLayoutModeChange = (mode: LayoutModeSetting) => updateSettings({ layoutMode: mode });
  const handleColorModeChange = (mode: ColorModeSetting) => updateSettings({ colorMode: mode });
  const handleExcludeIsolatedChange = (exclude: boolean) => updateSettings({ excludeIsolated: exclude });

  return (
    <>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Family Tree
          </Typography>
          <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
            <Tab label="List" />
            <Tab label="Graph" />
          </Tabs>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 2 }}>
            <TextField
              size="small"
              label="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or id"
              sx={{ minWidth: { xs: '100%', sm: 240 }, flexGrow: 1 }}
            />
            <Button
              size="small"
              variant={filterActive ? 'contained' : 'outlined'}
              color="primary"
              startIcon={<FilterAltIcon fontSize="small" />}
              onClick={openFilterDialog}
            >
              {filterActive ? 'Filter active' : 'Filter tree'}
            </Button>
            <Button size="small" variant="outlined" onClick={() => setReloadNonce((value) => value + 1)}>
              Force Reload
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<SettingsIcon fontSize="small" />}
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </Button>
          </Box>

          {effectiveData && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Typography variant="caption" color={filterActive ? 'primary' : 'text.secondary'}>
                {filterNotice}
              </Typography>
              {filterActive && (
                <Button size="small" variant="text" onClick={clearFilter}>
                  Clear
                </Button>
              )}
            </Box>
          )}

          {tab === 1 && settings.colorMode === 'role' && (
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ maxWidth: '100%', mb: 2 }}>
              {Object.entries(roleColors).map(([role, color]) => (
                <Chip key={role} size="small" label={role} sx={{ backgroundColor: color, color: getReadableTextColor(color) }} />
              ))}
            </Stack>
          )}

          {tab === 1 && settings.colorMode === 'owner' && ownerEntries.length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ maxWidth: '100%', mb: 2, alignItems: 'center' }}>
              {ownerChips}
            </Stack>
          )}

          {loading && <CircularProgress size={28} />}
          {error && <Typography color="error">{error}</Typography>}

          {!loading && !error && effectiveData && tab === 0 && (
            <Stack spacing={2}>
              <Typography variant="body2" sx={{ opacity: 0.7 }}>
                Expand / collapse nodes. Nodes with multiple parents appear under each parent and are marked as (ref).
              </Typography>
              <Box sx={{ maxHeight: '70vh', overflow: 'auto', pr: 1 }}>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {effectiveData.roots.map((root) => (
                    <NodeView
                      key={root.id}
                      node={root}
                      all={effectiveData.nodes}
                      toggle={toggle}
                      isCollapsed={isCollapsed}
                      renderAlterLink={linkRenderer}
                    />
                  ))}
                </ul>
              </Box>
            </Stack>
          )}

          {!loading && !error && effectiveData && tab === 1 && (
            <Box sx={{ overflow: 'auto', maxHeight: '80vh' }}>
              <FamilyTreeGraph
                data={effectiveData}
                highlight={highlightedSearch}
                roleColors={roleColors}
                ownerColors={ownerColors}
                colorMode={settings.colorMode}
                layoutMode={settings.layoutMode}
                excludeIsolated={settings.excludeIsolated}
                graphTheme={settings.graphTheme}
                onOpenAlter={openAlter}
              />
              <Typography variant="caption" display="block" sx={{ mt: 1, opacity: 0.6 }}>
                Line appearance follows your current theme. Solid lines represent parent / child relationships, dashed
                strokes connect partners, and dotted lines link user accounts.
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      <FilterDialog
        open={filterDialogOpen}
        draft={filterDraft}
        filterActive={filterActive}
        alterOptions={alterOptions}
        previewCount={filterPreviewCount}
        onClose={closeFilterDialog}
        onClear={clearFilter}
        onApply={applyFilterDraft}
        onDraftChange={updateFilterDraft}
        layerOptions={layerOptions}
        parseLayerLimit={parseLayerLimit}
      />

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        dashOptions={dashOptions}
        lineThemePresets={lineThemePresets}
        lineThemeDescription={lineThemeDescription}
        onClose={() => setSettingsOpen(false)}
        onLayoutModeChange={handleLayoutModeChange}
        onColorModeChange={handleColorModeChange}
        onExcludeIsolatedChange={handleExcludeIsolatedChange}
        onLineThemeSelect={handleLineThemeSelect}
        onResetTheme={handleResetTheme}
        onBackgroundColorChange={handleBackgroundColorChange}
        onNodeBorderChange={handleNodeBorderChange}
        onEdgeColorChange={handleEdgeColorChange}
        onEdgeWidthChange={handleEdgeWidthChange}
        onEdgeDashChange={handleEdgeDashChange}
        onEdgeOpacityChange={handleEdgeOpacityChange}
      />
    </>
  );
}
