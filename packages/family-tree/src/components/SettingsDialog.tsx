import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { GraphTheme, EdgeKind } from './graph/types';
import { EDGE_KINDS } from './graph/types';
import { EDGE_LABELS } from '../constants';
import type {
  ColorModeSetting,
  FamilyTreeSettings,
  LayoutModeSetting,
  LineThemeKey,
} from '../utils/treeSettings';

interface SettingsDialogProps {
  open: boolean;
  settings: FamilyTreeSettings;
  lineThemeDescription: string;
  lineThemePresets: Record<Exclude<LineThemeKey, 'custom'>, { label: string }>;
  dashOptions: Array<{ value: string; label: string; dash: string | null }>;
  onClose: () => void;
  onLayoutModeChange: (mode: LayoutModeSetting) => void;
  onColorModeChange: (mode: ColorModeSetting) => void;
  onExcludeIsolatedChange: (value: boolean) => void;
  onLineThemeSelect: (value: LineThemeKey) => void;
  onResetTheme: () => void;
  onBackgroundColorChange: (color: string) => void;
  onNodeBorderChange: (key: keyof GraphTheme['node'], color: string) => void;
  onEdgeColorChange: (kind: EdgeKind, color: string) => void;
  onEdgeWidthChange: (kind: EdgeKind, width: number) => void;
  onEdgeDashChange: (kind: EdgeKind, dashValue: string) => void;
  onEdgeOpacityChange: (kind: EdgeKind, opacity: number) => void;
}

export function SettingsDialog({
  open,
  settings,
  lineThemeDescription,
  lineThemePresets,
  dashOptions,
  onClose,
  onLayoutModeChange,
  onColorModeChange,
  onExcludeIsolatedChange,
  onLineThemeSelect,
  onResetTheme,
  onBackgroundColorChange,
  onNodeBorderChange,
  onEdgeColorChange,
  onEdgeWidthChange,
  onEdgeDashChange,
  onEdgeOpacityChange,
}: SettingsDialogProps) {
  const { graphTheme, layoutMode, colorMode, excludeIsolated, lineTheme } = settings;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Family tree settings</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <Stack spacing={1}>
            <Typography variant="subtitle2">Layout</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={layoutMode}
              onChange={(_, next) => next && onLayoutModeChange(next as LayoutModeSetting)}
            >
              <ToggleButton value="hierarchy">Family layout</ToggleButton>
              <ToggleButton value="group">Group layout</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Stack spacing={1}>
            <Typography variant="subtitle2">Coloring</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={colorMode}
              onChange={(_, next) => next && onColorModeChange(next as ColorModeSetting)}
            >
              <ToggleButton value="role">By role</ToggleButton>
              <ToggleButton value="owner">By owner</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <FormControlLabel
            control={
              <Checkbox
                checked={excludeIsolated}
                onChange={(event) => onExcludeIsolatedChange(event.target.checked)}
              />
            }
            label="Exclude singular, unconnected nodes"
          />

          <Divider />

          <Stack spacing={1}>
            <Typography variant="subtitle2">Line theme</Typography>
            <FormControl size="small" sx={{ maxWidth: 280 }}>
              <Select value={lineTheme} onChange={(event) => onLineThemeSelect(event.target.value as LineThemeKey)}>
                {Object.entries(lineThemePresets).map(([key, preset]) => (
                  <MenuItem key={key} value={key}>
                    {preset.label}
                  </MenuItem>
                ))}
                <MenuItem value="custom" disabled>
                  Custom (modified)
                </MenuItem>
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary">
              {lineThemeDescription}
            </Typography>
            <Button size="small" variant="text" onClick={onResetTheme} sx={{ alignSelf: 'flex-start' }}>
              Reset theme to default
            </Button>
          </Stack>

          <Divider />

          <Stack spacing={2}>
            <Typography variant="subtitle2">Theme editor</Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center">
              <ColorPicker
                label="Background"
                value={graphTheme.backgroundColor}
                onChange={onBackgroundColorChange}
              />
              <ColorPicker
                label="Alter border"
                value={graphTheme.node.alterBorder}
                onChange={(color) => onNodeBorderChange('alterBorder', color)}
              />
              <ColorPicker
                label="User border"
                value={graphTheme.node.userBorder}
                onChange={(color) => onNodeBorderChange('userBorder', color)}
              />
              <ColorPicker
                label="Highlight border"
                value={graphTheme.node.highlightBorder}
                onChange={(color) => onNodeBorderChange('highlightBorder', color)}
              />
            </Stack>

            <Stack spacing={1}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Edge styles
              </Typography>
              <Stack spacing={1.5}>
                {EDGE_KINDS.map((kind) => {
                  const appearance = graphTheme.edges[kind];
                  const dashValue = dashOptions.find((option) => option.dash === (appearance.dash ?? null))?.value ?? 'solid';
                  return (
                    <Stack
                      key={kind}
                      direction="row"
                      spacing={2}
                      flexWrap="wrap"
                      alignItems="center"
                      sx={{
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        p: 1,
                      }}
                    >
                      <Typography variant="body2" sx={{ minWidth: 150, fontWeight: 600 }}>
                        {EDGE_LABELS[kind]}
                      </Typography>
                      <ColorPicker
                        label="Color"
                        value={appearance.color}
                        onChange={(color) => onEdgeColorChange(kind, color)}
                        compact
                      />
                      <TextFieldSmall
                        label="Width"
                        value={appearance.width.toFixed(1)}
                        onChange={(value) => onEdgeWidthChange(kind, value)}
                      />
                      <FormControl size="small" sx={{ minWidth: 120 }}>
                        <Select value={dashValue} onChange={(event) => onEdgeDashChange(kind, String(event.target.value))}>
                          {dashOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption">Opacity</Typography>
                        <Slider
                          size="small"
                          min={10}
                          max={100}
                          step={5}
                          value={Math.round((appearance.opacity ?? 0.85) * 100)}
                          onChange={(_, value) => {
                            const percent = Array.isArray(value) ? value[0] : value;
                            onEdgeOpacityChange(kind, percent / 100);
                          }}
                          sx={{ width: 140 }}
                          valueLabelDisplay="auto"
                        />
                      </Box>
                    </Stack>
                  );
                })}
              </Stack>
            </Stack>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
  compact?: boolean;
}

function ColorPicker({ label, value, onChange, compact = false }: ColorPickerProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant={compact ? 'caption' : 'body2'}>{label}</Typography>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: compact ? 36 : 40, height: compact ? 24 : 28, border: 'none', background: 'transparent', cursor: 'pointer' }}
      />
    </Box>
  );
}

interface TextFieldSmallProps {
  label: string;
  value: string;
  onChange: (value: number) => void;
}

function TextFieldSmall({ label, value, onChange }: TextFieldSmallProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(parseFloat(event.target.value))}
        step={0.1}
        min={0.5}
        max={6}
        style={{ width: 100, padding: '6px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'inherit' }}
      />
    </Box>
  );
}

export default SettingsDialog;
