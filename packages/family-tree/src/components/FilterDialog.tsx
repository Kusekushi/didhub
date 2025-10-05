import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { AlterOption } from '../hooks/useTreeFilter';
import type { LayerLimit, TreeFilterState } from '../utils/treeFilters';

interface FilterDialogProps {
  open: boolean;
  draft: TreeFilterState | null;
  filterActive: boolean;
  alterOptions: AlterOption[];
  previewCount: number;
  onClose: () => void;
  onClear: () => void;
  onApply: () => void;
  onDraftChange: (patch: Partial<TreeFilterState>) => void;
  layerOptions: Array<{ value: LayerLimit; label: string }>;
  parseLayerLimit: (raw: string) => LayerLimit;
}

export function FilterDialog({
  open,
  draft,
  filterActive,
  alterOptions,
  previewCount,
  onClose,
  onClear,
  onApply,
  onDraftChange,
  layerOptions,
  parseLayerLimit,
}: FilterDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Filter family tree</DialogTitle>
      <DialogContent dividers>
        {draft ? (
          <Stack spacing={3} sx={{ mt: 1 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={draft.enabled}
                  onChange={(event) => onDraftChange({ enabled: event.target.checked })}
                />
              }
              label="Enable tree filter"
            />
            <Autocomplete
              options={alterOptions}
              value={
                draft.alterId != null
                  ? alterOptions.find((option) => option.id === draft.alterId) ?? null
                  : null
              }
              onChange={(_, option) => onDraftChange({ alterId: option?.id ?? null })}
              getOptionLabel={(option) => option.label}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="body2">{option.label}</Typography>
                    {option.subtitle && (
                      <Typography variant="caption" color="text.secondary">
                        {option.subtitle}
                      </Typography>
                    )}
                  </Box>
                </li>
              )}
              renderInput={(params) => <TextField {...params} label="Center alter" size="small" />}
              disabled={!draft.enabled}
              noOptionsText="No matching alters"
              fullWidth
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ flexWrap: 'wrap' }}>
              <LimitSelect
                title="Ancestors"
                value={draft.layersUp}
                disabled={!draft.enabled}
                onChange={(limit) => onDraftChange({ layersUp: limit })}
                options={layerOptions}
                parseLayerLimit={parseLayerLimit}
              />
              <LimitSelect
                title="Descendants"
                value={draft.layersDown}
                disabled={!draft.enabled}
                onChange={(limit) => onDraftChange({ layersDown: limit })}
                options={layerOptions}
                parseLayerLimit={parseLayerLimit}
              />
              <LimitSelect
                title="Partners & siblings"
                value={draft.layersSide}
                disabled={!draft.enabled}
                onChange={(limit) => onDraftChange({ layersSide: limit })}
                options={layerOptions}
                parseLayerLimit={parseLayerLimit}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {draft.enabled && draft.alterId != null
                ? previewCount > 0
                  ? `Preview includes ${previewCount} alters.`
                  : 'No alters would remain with the current limits.'
                : 'Enable the filter and choose an alter to preview the results.'}
            </Typography>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Loading filter options...
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onClear} disabled={!filterActive} color="secondary">
          Clear filter
        </Button>
        <Button onClick={onApply} variant="contained" disabled={!(draft?.enabled && draft?.alterId != null)}>
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface LimitSelectProps {
  title: string;
  value: LayerLimit;
  disabled: boolean;
  onChange: (limit: LayerLimit) => void;
  options: Array<{ value: LayerLimit; label: string }>;
  parseLayerLimit: (raw: string) => LayerLimit;
}

function LimitSelect({ title, value, disabled, onChange, options, parseLayerLimit }: LimitSelectProps) {
  return (
    <Stack spacing={0.5} sx={{ minWidth: 140 }}>
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <FormControl size="small" disabled={disabled}>
        <Select value={String(value)} onChange={(event) => onChange(parseLayerLimit(String(event.target.value)))}>
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value === 'all' ? 'all' : option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Stack>
  );
}

export default FilterDialog;
