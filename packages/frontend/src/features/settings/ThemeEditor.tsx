import { useContext, useMemo } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import type { PaletteMode, SelectChangeEvent } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ThemeToggleContext, ThemePaletteSettings } from '../../shared/contexts/ThemeContext';

const COLOR_FIELDS: Array<{ key: keyof ThemePaletteSettings; label: string; helper?: string }> = [
  { key: 'primary', label: 'Primary color', helper: 'Buttons, accents, interactive highlights' },
  { key: 'secondary', label: 'Secondary color', helper: 'Secondary actions, chips, outlines' },
  { key: 'success', label: 'Success color' },
  { key: 'warning', label: 'Warning color' },
  { key: 'background', label: 'Background', helper: 'App background / default surface' },
  { key: 'surface', label: 'Surface', helper: 'Cards, sheets, dialog surfaces' },
];

const FONT_OPTIONS = [
  { label: 'Inter', value: '"Inter", "InterVariable", "Segoe UI", system-ui, sans-serif' },
  { label: 'Segoe UI', value: '"Segoe UI", "Helvetica Neue", Arial, sans-serif' },
  { label: 'Roboto', value: '"Roboto", "Helvetica Neue", Arial, sans-serif' },
  { label: 'Nunito', value: '"Nunito", "Segoe UI", system-ui, sans-serif' },
  { label: 'Space Grotesk', value: '"Space Grotesk", "Segoe UI", system-ui, sans-serif' },
  { label: 'Atkinson Hyperlegible', value: '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif' },
];

const FONT_SIZE_RANGE: [number, number] = [12, 18];
const BORDER_RADIUS_RANGE: [number, number] = [0, 24];

export default function ThemeEditor() {
  const theme = useTheme();
  const {
    settings,
    mode,
    setMode,
    toggle,
    updatePalette,
    updateBase,
    presets,
    applyPreset,
    resetToDefault,
    currentPresetId,
  } = useContext(ThemeToggleContext);

  const palette = settings[mode];

  const handleColorChange = (field: keyof ThemePaletteSettings) => (event: React.ChangeEvent<HTMLInputElement>) => {
    updatePalette(mode, { [field]: event.target.value });
  };

  const handlePresetChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    if (value === 'custom') return;
    applyPreset(value, true);
  };

  const fontSelectValue = useMemo(() => {
    const match = FONT_OPTIONS.find((opt) => opt.value === settings.fontFamily);
    return match ? match.value : settings.fontFamily;
  }, [settings.fontFamily]);

  const densityValue = settings.density;

  return (
    <Card variant="outlined" sx={{ mt: 3 }}>
      <CardHeader
        title="Theme preferences"
        subheader="Adjust palette, typography, and density. Changes are saved in this browser per account."
      />
      <CardContent>
        <Stack spacing={3}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
            <FormControl sx={{ minWidth: 200 }} size="small">
              <InputLabel id="theme-preset-label">Preset</InputLabel>
              <Select
                labelId="theme-preset-label"
                label="Preset"
                value={currentPresetId ?? 'custom'}
                onChange={handlePresetChange}
              >
                <MenuItem value="custom" disabled>
                  Custom
                </MenuItem>
                {presets.map((preset) => (
                  <MenuItem key={preset.id} value={preset.id}>
                    <Stack spacing={0.3}>
                      <Typography variant="body2" fontWeight={600}>
                        {preset.label}
                      </Typography>
                      {preset.description && (
                        <Typography
                          variant="caption"
                          sx={{ whiteSpace: 'normal', maxWidth: 320 }}
                          color="text.secondary"
                        >
                          {preset.description}
                        </Typography>
                      )}
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">Active mode</Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={mode}
                onChange={(_, value: PaletteMode | null) => {
                  if (!value) return;
                  setMode(value);
                }}
              >
                <ToggleButton value="light">Light</ToggleButton>
                <ToggleButton value="dark">Dark</ToggleButton>
              </ToggleButtonGroup>
              <Tooltip title="Quick toggle">
                <Button variant="outlined" size="small" onClick={toggle}>
                  Toggle
                </Button>
              </Tooltip>
            </Stack>
            <Box sx={{ flexGrow: 1 }} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="outlined" size="small" onClick={() => resetToDefault(mode)}>
                Reset this mode
              </Button>
              <Button variant="text" size="small" onClick={() => resetToDefault()}>
                Reset all to default
              </Button>
            </Stack>
          </Stack>

          <Divider flexItem />

          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(3, minmax(0, 1fr))',
              },
            }}
          >
            {COLOR_FIELDS.map((field) => (
              <Box key={field.key}>
                <TextField
                  fullWidth
                  size="small"
                  type="color"
                  label={field.label}
                  value={palette[field.key]}
                  onChange={handleColorChange(field.key)}
                  helperText={field.helper}
                  InputLabelProps={{ shrink: true }}
                />
              </Box>
            ))}
          </Box>

          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              alignItems: 'start',
            }}
          >
            <FormControl fullWidth size="small">
              <InputLabel id="font-family-label">Font family</InputLabel>
              <Select
                labelId="font-family-label"
                label="Font family"
                value={fontSelectValue}
                onChange={(event) => updateBase({ fontFamily: event.target.value })}
              >
                {FONT_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
                <MenuItem value={settings.fontFamily}>Custom: {settings.fontFamily}</MenuItem>
              </Select>
            </FormControl>
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                alignItems: 'center',
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Base font size ({settings.fontSize}px)
                </Typography>
                <Slider
                  sx={{ mt: 1 }}
                  value={settings.fontSize}
                  min={FONT_SIZE_RANGE[0]}
                  max={FONT_SIZE_RANGE[1]}
                  step={1}
                  marks
                  onChange={(_, value) => updateBase({ fontSize: Array.isArray(value) ? value[0] : (value as number) })}
                  valueLabelDisplay="auto"
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Border radius ({settings.borderRadius}px)
                </Typography>
                <Slider
                  sx={{ mt: 1 }}
                  value={settings.borderRadius}
                  min={BORDER_RADIUS_RANGE[0]}
                  max={BORDER_RADIUS_RANGE[1]}
                  step={1}
                  marks
                  onChange={(_, value) =>
                    updateBase({ borderRadius: Array.isArray(value) ? value[0] : (value as number) })
                  }
                  valueLabelDisplay="auto"
                />
              </Box>
            </Box>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <Typography variant="body2">Density</Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={densityValue}
              onChange={(_, value: 'comfortable' | 'compact' | null) => {
                if (!value) return;
                updateBase({ density: value });
              }}
            >
              <ToggleButton value="comfortable">Comfortable</ToggleButton>
              <ToggleButton value="compact">Compact</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Divider flexItem />

          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            }}
          >
            <Card variant="outlined" sx={{ bgcolor: theme.palette.background.paper }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Preview
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Buttons and alerts adapt to your palette.
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button variant="contained">Contained</Button>
                  <Button variant="outlined">Outlined</Button>
                  <Button variant="text">Text</Button>
                  <Button color="secondary" variant="contained">
                    Secondary
                  </Button>
                  <Button color="success" variant="contained">
                    Success
                  </Button>
                  <Button color="warning" variant="contained">
                    Warning
                  </Button>
                </Stack>
              </CardContent>
            </Card>
            <Card variant="outlined" sx={{ bgcolor: theme.palette.background.paper }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Sample content
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  This preview automatically reflects your typography, density, and border radius settings. Use it as a
                  quick check to see how cards and text will look across the app.
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
